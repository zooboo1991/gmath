import { getSupabase } from "./supabase";
import { listCourses, listYearlyPrograms } from "./db";
import { parseScheduleString } from "./lessonSchedule";

/** A lesson that runs today, with what the admin needs to see at a glance. */
export type TodayLesson = {
  courseId: string;
  courseLabel: string;
  lessonIndex: number;
  topic: string;
  timeLabel: string;
  /** A room exists for it. Without one the students have nowhere to go. */
  hasZoom: boolean;
  /** Distinct students the Zoom webhook has seen in the room. */
  attended: number;
};

export type OperationsSnapshot = {
  assessment: {
    /** Handed in, waiting for a teacher. */
    waitingToGrade: number;
    /** Being marked right now. */
    beingGraded: number;
    /** Children with the paper open, still solving. */
    solving: number;
    /** Finished and read by the family. */
    completed: number;
    /** Exams the teacher has left open. */
    openExams: number;
  };
  support: {
    /** Chat complaints nobody has closed. */
    openIssues: number;
  };
  /** Accounts other than the owner's Vercel password. */
  staffAccounts: number;
  todayLessons: TodayLesson[];
};

async function count(table: string, filters: Record<string, string> = {}): Promise<number> {
  let query = getSupabase().from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

/** Today in Mongolia (UTC+8, no DST), as the "2026.08.24" a schedule string starts with. */
function mongoliaToday(now: Date): string {
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Every lesson dated today, across the yearly programmes and the courses. */
async function findTodayLessons(now: Date): Promise<TodayLesson[]> {
  const today = mongoliaToday(now);
  const [programs, courses] = await Promise.all([
    listYearlyPrograms().catch(() => []),
    listCourses(undefined, { includeDrafts: true }).catch(() => []),
  ]);

  const owners = [
    ...programs.map((p) => ({ id: p.id, label: p.label || p.title, lessons: p.lessons })),
    ...courses.map((c) => ({ id: c.id, label: c.title, lessons: c.lessons })),
  ];

  const found: TodayLesson[] = [];
  for (const owner of owners) {
    (owner.lessons ?? []).forEach((lesson, lessonIndex) => {
      const { date, startTime, endTime } = parseScheduleString(lesson.schedule ?? "");
      if (date !== today) return;
      found.push({
        courseId: owner.id,
        courseLabel: owner.label,
        lessonIndex,
        topic: lesson.topic,
        timeLabel: startTime && endTime ? `${startTime}–${endTime}` : startTime,
        hasZoom: Boolean(lesson.zoomLink),
        attended: 0,
      });
    });
  }
  if (found.length === 0) return found;

  // Attendance comes off the tracked meetings — one query for the meetings,
  // one for their attendance rows, however many lessons there are today.
  const supabase = getSupabase();
  const { data: meetingRows } = await supabase
    .from("lesson_meetings")
    .select("id, course_id, lesson_index")
    .in("course_id", [...new Set(found.map((l) => l.courseId))]);
  const meetings = (meetingRows ?? []) as { id: string; course_id: string; lesson_index: number }[];
  if (meetings.length === 0) return found;

  const { data: attendanceRows } = await supabase
    .from("lesson_attendance")
    .select("lesson_meeting_id, user_id")
    .in("lesson_meeting_id", meetings.map((m) => m.id));
  const seen = new Map<string, Set<string>>();
  for (const row of (attendanceRows ?? []) as { lesson_meeting_id: string; user_id: string }[]) {
    const set = seen.get(row.lesson_meeting_id) ?? new Set<string>();
    set.add(row.user_id);
    seen.set(row.lesson_meeting_id, set);
  }

  return found.map((lesson) => {
    const meeting = meetings.find(
      (m) => m.course_id === lesson.courseId && m.lesson_index === lesson.lessonIndex
    );
    return {
      ...lesson,
      attended: meeting ? (seen.get(meeting.id)?.size ?? 0) : 0,
    };
  });
}

/**
 * The running side of the school — what is happening today and what is
 * waiting on someone — kept apart from getDashboardStats(), which counts
 * registrations and money.
 *
 * Every part degrades to zero rather than throwing: a dashboard that fails
 * to load because one newer table is missing helps nobody.
 */
export async function getOperationsSnapshot(now = new Date()): Promise<OperationsSnapshot> {
  const [
    waitingToGrade,
    beingGraded,
    solving,
    completed,
    openExams,
    openIssues,
    staffAccounts,
    todayLessons,
  ] = await Promise.all([
    count("assessments", { status: "problems_submitted" }).catch(() => 0),
    count("assessments", { status: "grading" }).catch(() => 0),
    count("assessments", { status: "questionnaire_done" }).catch(() => 0),
    count("assessments", { status: "completed" }).catch(() => 0),
    count("exams", { status: "open" }).catch(() => 0),
    count("chat_issues", { status: "new" }).catch(() => 0),
    count("admin_users", { active: "true" }).catch(() => 0),
    findTodayLessons(now).catch(() => [] as TodayLesson[]),
  ]);

  return {
    assessment: { waitingToGrade, beingGraded, solving, completed, openExams },
    support: { openIssues },
    staffAccounts,
    todayLessons,
  };
}
