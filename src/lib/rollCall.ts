import { getSupabase } from "./supabase";
import { fetchAllRows } from "./fetchAll";
import {
  findCourseById,
  findYearlyProgramById,
  listCourses,
  listRegistrationsByProgram,
  listYearlyPrograms,
  type Lesson,
} from "./db";
import { parseScheduleString } from "./lessonSchedule";
import { attendsOn, type AttendDaysEntry } from "./attendDays";
import { classGroupLabel, inClassGroup } from "./classGroups";

/** A classroom lesson the teacher can take the register for. */
export type RollCallLesson = {
  courseId: string;
  /** The course, and the class when the lesson is one class's ("1 жилийн D · 1-р анги"). */
  courseLabel: string;
  lessonIndex: number;
  topic: string;
  date: string;
  timeLabel: string;
  /** How many students are expected at this lesson: on the course, attending its weekday, and in its class. */
  rosterCount: number;
  /** The class the lesson is for, when the course's classroom is split (see lib/classGroups). */
  group?: number;
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

/** The register's heading for a lesson: the course, plus the class when the lesson is one class's. */
function lessonLabel(courseLabel: string, group: number | undefined): string {
  return group ? `${courseLabel} · ${classGroupLabel(group)}` : courseLabel;
}

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

type RosterEntry = { userId: string; name: string; phone: string; attendDays?: AttendDaysEntry[]; classGroup?: number };

/** The active roster of a course, in the order a register is read, with each child's weekdays and class. */
async function courseRoster(courseId: string): Promise<RosterEntry[]> {
  const registrations = await listRegistrationsByProgram(courseId);
  return registrations
    // The school's own test account sits in no classroom — a teacher reading
    // the register should not have to skip past it.
    .filter((r) => r.status === "active" && r.user && !r.user.isTest)
    .map((r) => ({
      userId: r.user!.id,
      name: `${r.user!.lastName} ${r.user!.firstName}`.trim() || r.user!.phone,
      phone: r.user!.phone,
      attendDays: r.attendDays,
      classGroup: r.classGroup,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "mn"));
}

/** Whether a child is expected at a lesson on `date` that is for class `group` (unset: everyone's). */
function expects(r: RosterEntry, date: string, group: number | undefined): boolean {
  return attendsOn(r.attendDays, date) && inClassGroup(r.classGroup, group);
}

/**
 * The children expected at a lesson on `date`: on the course, attending that
 * weekday as their days stood then, and in the lesson's class. A child who comes
 * only on Мягмар and Пүрэв is not on a Баасан register, nor a 2-р анги child on
 * the 1-р анги's. An undated lesson expects everyone of its class.
 */
function expectedOn(
  roster: RosterEntry[],
  date: string,
  group?: number
): { userId: string; name: string; phone: string }[] {
  return roster.filter((r) => expects(r, date, group)).map(({ userId, name, phone }) => ({ userId, name, phone }));
}

/** Children on the course not expected at that lesson — their marks there are not shown or counted. */
function offDayIds(roster: RosterEntry[], date: string, group?: number): Set<string> {
  return new Set(roster.filter((r) => !expects(r, date, group)).map((r) => r.userId));
}

/** The children expected at a lesson on `date` for class `group` (every active child when neither is given). */
export async function getRoster(
  courseId: string,
  date = "",
  group?: number
): Promise<{ userId: string; name: string; phone: string }[]> {
  return expectedOn(await courseRoster(courseId), date, group);
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
  /** Only lessons before this date — the history tab, which must not show days still to come. */
  before?: string;
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
      if (opts.before && date >= opts.before) return;
      found.push({
        courseId: owner.id,
        courseLabel: lessonLabel(owner.label, lesson.group),
        lessonIndex,
        topic: lesson.topic,
        date,
        timeLabel: startTime && endTime ? `${startTime}–${endTime}` : startTime,
        rosterCount: 0,
        group: lesson.group,
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
  const lessonIndexes = [...new Set(lessons.map((l) => l.lessonIndex))];
  // Narrowed to the lesson numbers on screen, and paged besides. The filter was
  // course_id alone, which fetched every register ever taken on those courses —
  // roster times every lesson, so one course-year is about a thousand marks on
  // its own. Truncated, an old lesson shows fewer present and absent, or drops
  // to none at all, which the screen renders as "this register was never
  // taken".
  const marks = await fetchAllRows<{ course_id: string; lesson_index: number; user_id: string; present: boolean }>(() =>
    getSupabase()
      .from("lesson_roll_call")
      .select("course_id, lesson_index, user_id, present")
      .in("course_id", courseIds)
      .in("lesson_index", lessonIndexes)
      .order("id")
  );

  const rosters = new Map<string, RosterEntry[]>();
  for (const courseId of courseIds) {
    rosters.set(courseId, await courseRoster(courseId));
  }

  return lessons.map((lesson) => {
    // A child who does not attend that weekday, or is in the other class, is not
    // counted; a child who has since left the course still is, as the register was taken.
    const roster = rosters.get(lesson.courseId) ?? [];
    const offDay = offDayIds(roster, lesson.date, lesson.group);
    const mine = marks.filter(
      (m) => m.course_id === lesson.courseId && m.lesson_index === lesson.lessonIndex && !offDay.has(m.user_id)
    );
    return {
      ...lesson,
      rosterCount: roster.length - offDay.size,
      present: mine.length > 0 ? mine.filter((m) => m.present).length : null,
      absent: mine.length > 0 ? mine.filter((m) => !m.present).length : null,
    };
  });
}

/** The register for one lesson: everyone on the course, and how they were marked. */
export async function getRollCall(
  courseId: string,
  lessonIndex: number
): Promise<{ lesson: RollCallLesson | null; students: RollCallStudent[]; offDay: number }> {
  const owner = (await findYearlyProgramById(courseId)) ?? (await findCourseById(courseId));
  const lesson = owner?.lessons?.[lessonIndex];
  const parsed = parseScheduleString(lesson?.schedule ?? "");
  const everyone = await courseRoster(courseId);
  const roster = expectedOn(everyone, parsed.date, lesson?.group);
  const offDay = offDayIds(everyone, parsed.date, lesson?.group);

  const { data } = await getSupabase()
    .from("lesson_roll_call")
    .select("user_id, present")
    .eq("course_id", courseId)
    .eq("lesson_index", lessonIndex);
  // Not the children who do not attend that weekday: a mark left from before their days changed is not counted.
  const marks = new Map(
    ((data ?? []) as { user_id: string; present: boolean }[])
      .filter((m) => !offDay.has(m.user_id))
      .map((m) => [m.user_id, m.present])
  );

  return {
    lesson: lesson
      ? {
          courseId,
          courseLabel: lessonLabel(owner ? ("label" in owner ? owner.label : owner.title) : courseId, lesson.group),
          lessonIndex,
          topic: lesson.topic,
          date: parsed.date,
          timeLabel:
            parsed.startTime && parsed.endTime
              ? `${parsed.startTime}–${parsed.endTime}`
              : parsed.startTime,
          rosterCount: roster.length,
          group: lesson.group,
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
    offDay: offDay.size,
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

/**
 * Нэг сурагчийн нэг сургалт дээрх бүх ирцийн тэмдэглэгээ, хичээлийн
 * дугаараар. Багш бүртгэл аваагүй хичээл энд байхгүй — "тасалсан" биш
 * "мэдэгдэхгүй" гэсэн үг тул дутуу мөрийг нөхөж болохгүй.
 */
export async function listRollCallForUser(
  courseId: string,
  userId: string
): Promise<Record<number, boolean>> {
  const { data, error } = await getSupabase()
    .from("lesson_roll_call")
    .select("lesson_index, present")
    .eq("course_id", courseId)
    .eq("user_id", userId);
  if (error) throw error;
  const byLessonIndex: Record<number, boolean> = {};
  for (const row of (data ?? []) as { lesson_index: number; present: boolean }[]) {
    byLessonIndex[row.lesson_index] = row.present;
  }
  return byLessonIndex;
}
