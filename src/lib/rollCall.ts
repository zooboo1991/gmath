import { getSupabase } from "./supabase";
import {
  findCourseById,
  findYearlyProgramById,
  listCourses,
  listRegistrationsByProgram,
  listYearlyPrograms,
  type Lesson,
} from "./db";
import { parseScheduleString } from "./lessonSchedule";

/** A classroom lesson the teacher can take the register for. */
export type RollCallLesson = {
  courseId: string;
  courseLabel: string;
  lessonIndex: number;
  topic: string;
  date: string;
  timeLabel: string;
  /** How many students are on the course right now. */
  rosterCount: number;
  /** Marks already saved, if the register was taken. */
  present: number | null;
  absent: number | null;
};

export type RollCallStudent = {
  userId: string;
  name: string;
  phone: string;
  /** Undefined when nobody has taken this register yet. */
  present?: boolean;
};

/** Today in Mongolia (UTC+8, no DST). */
export function mongoliaToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Owner = { id: string; label: string; lessons: Lesson[] };

async function allOwners(): Promise<Owner[]> {
  const [programs, courses] = await Promise.all([
    listYearlyPrograms().catch(() => []),
    listCourses(undefined, { includeDrafts: true }).catch(() => []),
  ]);
  return [
    ...programs.map((p) => ({ id: p.id, label: p.label || p.title, lessons: p.lessons ?? [] })),
    ...courses.map((c) => ({ id: c.id, label: c.title, lessons: c.lessons ?? [] })),
  ];
}

/** The active roster of a course, in the order a register is read. */
export async function getRoster(courseId: string): Promise<{ userId: string; name: string; phone: string }[]> {
  const registrations = await listRegistrationsByProgram(courseId);
  return registrations
    .filter((r) => r.status === "active" && r.user)
    .map((r) => ({
      userId: r.user!.id,
      name: `${r.user!.lastName} ${r.user!.firstName}`.trim() || r.user!.phone,
      phone: r.user!.phone,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "mn"));
}

/**
 * Classroom lessons, with whatever register has already been taken.
 *
 * Only `mode === "inperson"`: an online lesson's attendance comes from Zoom,
 * and asking a teacher to mark it by hand would be duplicate work on worse
 * information.
 */
export async function listRollCallLessons(opts: {
  onlyDate?: string;
  courseId?: string;
  limit?: number;
}): Promise<RollCallLesson[]> {
  const owners = await allOwners();
  const found: RollCallLesson[] = [];

  for (const owner of owners) {
    if (opts.courseId && owner.id !== opts.courseId) continue;
    owner.lessons.forEach((lesson, lessonIndex) => {
      if (lesson.mode !== "inperson") return;
      const { date, startTime, endTime } = parseScheduleString(lesson.schedule ?? "");
      if (!date) return;
      if (opts.onlyDate && date !== opts.onlyDate) return;
      found.push({
        courseId: owner.id,
        courseLabel: owner.label,
        lessonIndex,
        topic: lesson.topic,
        date,
        timeLabel: startTime && endTime ? `${startTime}–${endTime}` : startTime,
        rosterCount: 0,
        present: null,
        absent: null,
      });
    });
  }

  found.sort((a, b) => (a.date === b.date ? a.timeLabel.localeCompare(b.timeLabel) : a.date < b.date ? 1 : -1));
  const lessons = opts.limit ? found.slice(0, opts.limit) : found;
  if (lessons.length === 0) return lessons;

  // Marks and rosters for the lessons we are about to show, in two queries.
  const courseIds = [...new Set(lessons.map((l) => l.courseId))];
  const { data } = await getSupabase()
    .from("lesson_roll_call")
    .select("course_id, lesson_index, present")
    .in("course_id", courseIds);
  const marks = (data ?? []) as { course_id: string; lesson_index: number; present: boolean }[];

  const rosterSizes = new Map<string, number>();
  for (const courseId of courseIds) {
    rosterSizes.set(courseId, (await getRoster(courseId)).length);
  }

  return lessons.map((lesson) => {
    const mine = marks.filter(
      (m) => m.course_id === lesson.courseId && m.lesson_index === lesson.lessonIndex
    );
    return {
      ...lesson,
      rosterCount: rosterSizes.get(lesson.courseId) ?? 0,
      present: mine.length > 0 ? mine.filter((m) => m.present).length : null,
      absent: mine.length > 0 ? mine.filter((m) => !m.present).length : null,
    };
  });
}

/** The register for one lesson: everyone on the course, and how they were marked. */
export async function getRollCall(
  courseId: string,
  lessonIndex: number
): Promise<{ lesson: RollCallLesson | null; students: RollCallStudent[] }> {
  const owner = (await findYearlyProgramById(courseId)) ?? (await findCourseById(courseId));
  const lesson = owner?.lessons?.[lessonIndex];
  const roster = await getRoster(courseId);

  const { data } = await getSupabase()
    .from("lesson_roll_call")
    .select("user_id, present")
    .eq("course_id", courseId)
    .eq("lesson_index", lessonIndex);
  const marks = new Map(
    ((data ?? []) as { user_id: string; present: boolean }[]).map((m) => [m.user_id, m.present])
  );

  const parsed = parseScheduleString(lesson?.schedule ?? "");
  return {
    lesson: lesson
      ? {
          courseId,
          courseLabel: owner ? ("label" in owner ? owner.label : owner.title) : courseId,
          lessonIndex,
          topic: lesson.topic,
          date: parsed.date,
          timeLabel:
            parsed.startTime && parsed.endTime
              ? `${parsed.startTime}–${parsed.endTime}`
              : parsed.startTime,
          rosterCount: roster.length,
          present: marks.size > 0 ? [...marks.values()].filter(Boolean).length : null,
          absent: marks.size > 0 ? [...marks.values()].filter((p) => !p).length : null,
        }
      : null,
    students: roster.map((student) => ({
      ...student,
      // Nobody marked yet means "everyone is here until told otherwise" —
      // the screen starts with every box ticked.
      present: marks.has(student.userId) ? marks.get(student.userId) : undefined,
    })),
  };
}

/** Writes the register. Re-marking a lesson overwrites the earlier marks. */
export async function saveRollCall(input: {
  courseId: string;
  lessonIndex: number;
  marks: { userId: string; present: boolean }[];
  markedBy?: string;
}): Promise<{ present: number; absent: number }> {
  if (input.marks.length === 0) return { present: 0, absent: 0 };
  const { error } = await getSupabase()
    .from("lesson_roll_call")
    .upsert(
      input.marks.map((mark) => ({
        course_id: input.courseId,
        lesson_index: input.lessonIndex,
        user_id: mark.userId,
        present: mark.present,
        marked_by: input.markedBy ?? null,
        marked_at: new Date().toISOString(),
      })),
      { onConflict: "course_id,lesson_index,user_id" }
    );
  if (error) throw error;
  return {
    present: input.marks.filter((m) => m.present).length,
    absent: input.marks.filter((m) => !m.present).length,
  };
}
