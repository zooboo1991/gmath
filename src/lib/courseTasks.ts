import { getSupabase } from "./supabase";
import { examFromRow, findExam, listExamProblems, openExamPaper, type Exam, type ExamRow } from "./assessment/exams";
import { listCourseSittings, listExamSittings, listPaperTotals, updateAssessment } from "./assessment/db";
import { publicUserFromJoin, type PublicUser } from "./db";
import type { Assessment } from "./assessment/types";
import { mongoliaLocalToUtc } from "./lessonSchedule";
import { courseWeeks, weeklyRhythm } from "./onlineCourse";
import { WEEKDAY_NAMES } from "./attendDays";

/**
 * A course's homework and test papers (Даалгавар, Сорил).
 *
 * Each is an exam of kind homework/test that belongs to one course and is open
 * for a window — Мягмар 09:00–21:00 — so the problem roll, photo upload and
 * grading queue are the placement test's own. What is different is who may sit
 * one (the course's active students, free), when (inside the window; only a
 * paper handed in by «Илгээх» counts), and that a sitting is track 'course', so
 * no placement path ever mistakes it for a level test.
 */

export type CourseTaskKind = "homework" | "test";

export type CourseTask = Exam & {
  kind: CourseTaskKind;
  programId: string;
  opensAt: string;
  closesAt: string;
  problemCount: number;
};

export const TASK_KIND_LABEL: Record<CourseTaskKind, string> = { homework: "Даалгавар", test: "Сорил" };
/** "Даалгаврын хугацаа", "Сорилын хугацаа". */
const KIND_GENITIVE: Record<CourseTaskKind, string> = { homework: "Даалгаврын", test: "Сорилын" };
const kindOf = (exam: Pick<Exam, "kind">): CourseTaskKind => (exam.kind === "test" ? "test" : "homework");

/** A course's papers in the order they open. */
export async function listCourseTasks(programId: string): Promise<CourseTask[]> {
  const { data, error } = await getSupabase()
    .from("exams")
    .select("*, exam_problems(problem_id)")
    .eq("program_id", programId)
    .in("kind", ["homework", "test"])
    .order("opens_at")
    .order("position");
  if (error) throw error;
  type Row = ExamRow & { exam_problems: { problem_id: string }[] | null };
  return (data as Row[])
    .map((row) => ({ ...examFromRow(row), problemCount: (row.exam_problems ?? []).length }))
    .filter((t): t is CourseTask => Boolean(t.programId && t.opensAt && t.closesAt) && t.kind !== "placement");
}

/** Where now falls against a paper's window. */
export function taskWindow(task: Pick<Exam, "opensAt" | "closesAt">, now = new Date()): "before" | "open" | "after" {
  const t = now.getTime();
  if (task.opensAt && t < new Date(task.opensAt).getTime()) return "before";
  if (task.closesAt && t >= new Date(task.closesAt).getTime()) return "after";
  return "open";
}

export type TaskState = "upcoming" | "preparing" | "open" | "in_progress" | "submitted" | "graded" | "missed";

const HANDED_IN = new Set(["problems_submitted", "grading", "completed"]);

/** What a child sees on one paper: from not yet open, through solving, to graded or missed. */
export function taskState(
  task: Pick<CourseTask, "opensAt" | "closesAt" | "status" | "problemCount">,
  sitting: Pick<Assessment, "status"> | undefined,
  now = new Date()
): TaskState {
  if (sitting?.status === "completed") return "graded";
  if (sitting && HANDED_IN.has(sitting.status)) return "submitted";
  const window = taskWindow(task, now);
  if (window === "before") return "upcoming";
  if (window === "after") return "missed";
  if (sitting) return "in_progress";
  return task.status === "open" && task.problemCount > 0 ? "open" : "preparing";
}

export type StudentTask = {
  examId: string;
  kind: CourseTaskKind;
  title: string;
  opensAt: string;
  closesAt: string;
  problemCount: number;
  state: TaskState;
  assessmentId?: string;
  total?: number;
  max?: number;
};

/** One child's view of a course's papers, with their own sitting and score on each. */
export async function listStudentTasks(programId: string, userId: string, now = new Date()): Promise<StudentTask[]> {
  const tasks = await listCourseTasks(programId);
  if (tasks.length === 0) return [];
  const sittings = await listCourseSittings(userId, tasks.map((t) => t.id));
  const graded = [...sittings.values()].filter((s) => s.status === "completed");
  const totals = graded.length ? await listPaperTotals(graded) : {};
  return tasks.flatMap((task) => {
    const sitting = sittings.get(task.id);
    // A paper the teacher never opened, and whose day has passed, did not
    // happen — it is not the child's to have missed.
    if (!sitting && task.status === "draft" && taskWindow(task, now) === "after") return [];
    const score = sitting ? totals[sitting.id] : undefined;
    return {
      examId: task.id,
      kind: task.kind,
      title: task.title,
      opensAt: task.opensAt,
      closesAt: task.closesAt,
      problemCount: task.problemCount,
      state: taskState(task, sitting, now),
      assessmentId: sitting?.id,
      ...(score ? { total: score.total, max: score.max } : {}),
    };
  });
}

export type SubmissionState = "not_started" | "started" | "submitted" | "grading" | "graded";

export type TaskSubmission = {
  userId: string;
  name: string;
  grade?: string;
  isTest: boolean;
  state: SubmissionState;
  assessmentId?: string;
  /** Problems with at least one photo on them — handed in or not. */
  photographed: number;
  total?: number;
  max?: number;
};

const SUBMISSION_ORDER: SubmissionState[] = ["graded", "grading", "submitted", "started", "not_started"];

/**
 * One paper against the course's children, for its admin page: who never
 * opened it, who started without pressing «Илгээх», who handed in, and the
 * score once the paper is finished. A child who sat it and has left the course
 * since is still listed — the sitting is theirs.
 */
export async function listTaskSubmissions(task: { id: string; programId: string }): Promise<TaskSubmission[]> {
  const [regs, sittings] = await Promise.all([
    getSupabase().from("registrations").select("users(*)").eq("program_id", task.programId).eq("status", "active"),
    listExamSittings(task.id),
  ]);
  if (regs.error) throw regs.error;

  const people = new Map<string, PublicUser>();
  for (const r of regs.data as { users: unknown }[]) {
    const u = publicUserFromJoin(Array.isArray(r.users) ? r.users[0] : r.users);
    if (u) people.set(u.id, u);
  }
  const byUser = new Map<string, Assessment>();
  for (const { user, ...sitting } of sittings) {
    if (!user) continue;
    people.set(user.id, user);
    byUser.set(user.id, sitting);
  }

  const ids = [...byUser.values()].map((a) => a.id);
  const photographed = new Map<string, number>();
  if (ids.length > 0) {
    const { data, error } = await getSupabase().from("solutions").select("assessment_id, image_paths").in("assessment_id", ids);
    if (error) throw error;
    for (const s of data as { assessment_id: string; image_paths: string[] | null }[]) {
      if ((s.image_paths ?? []).length > 0) photographed.set(s.assessment_id, (photographed.get(s.assessment_id) ?? 0) + 1);
    }
  }
  const graded = [...byUser.values()].filter((a) => a.status === "completed");
  const totals = graded.length ? await listPaperTotals(graded) : {};

  const stateOf = (a: Assessment | undefined): SubmissionState => {
    if (!a) return "not_started";
    if (a.status === "completed") return "graded";
    if (a.status === "grading") return "grading";
    if (a.status === "problems_submitted") return "submitted";
    return "started";
  };
  return [...people.values()]
    .map((u) => {
      const a = byUser.get(u.id);
      const score = a ? totals[a.id] : undefined;
      return {
        userId: u.id,
        name: `${u.lastName ?? ""} ${u.firstName ?? ""}`.trim() || "(нэргүй)",
        grade: u.grade,
        isTest: Boolean(u.isTest),
        state: stateOf(a),
        assessmentId: a?.id,
        photographed: a ? (photographed.get(a.id) ?? 0) : 0,
        ...(score ? { total: score.total, max: score.max } : {}),
      };
    })
    .sort((x, y) => SUBMISSION_ORDER.indexOf(x.state) - SUBMISSION_ORDER.indexOf(y.state) || x.name.localeCompare(y.name, "mn"));
}

async function hasActiveRegistration(userId: string, programId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .select("id")
    .eq("user_id", userId)
    .eq("program_id", programId)
    .eq("status", "active")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

type StartResult = { ok: true; assessmentId: string } | { ok: false; error: string; status: number };

/**
 * Opens a paper for a child: their existing sitting, or a new free one with the
 * problems laid out. Only for the course's active students, only inside the
 * window, only once the teacher has opened it with problems on it.
 */
export async function startCourseTask(examId: string, userId: string, now = new Date()): Promise<StartResult> {
  const exam = await findExam(examId);
  // Someone else's course, or no such paper: both read as "not found".
  if (!exam || exam.kind === "placement" || !exam.programId || !(await hasActiveRegistration(userId, exam.programId))) {
    return { ok: false, error: "Даалгавар олдсонгүй", status: 404 };
  }
  const existing = (await listCourseSittings(userId, [examId])).get(examId);
  if (existing && HANDED_IN.has(existing.status)) return { ok: true, assessmentId: existing.id };

  const label = TASK_KIND_LABEL[kindOf(exam)];
  const window = taskWindow(exam, now);
  if (window === "before") return { ok: false, error: `${label} хараахан нээгдээгүй байна`, status: 409 };
  if (window === "after") return { ok: false, error: `${KIND_GENITIVE[kindOf(exam)]} хугацаа дууссан`, status: 409 };

  if (existing) return { ok: true, assessmentId: await laidOut(existing, now) };
  if (exam.status !== "open" || (await listExamProblems(examId)).length === 0) {
    return { ok: false, error: `${label} бэлтгэгдэж байна. Түр хүлээгээд дахин оролдоно уу.`, status: 409 };
  }

  // Free and paid in the one insert: a sitting is never seen half-made, waiting
  // for a payment that will not come.
  const { data, error } = await getSupabase()
    .from("assessments")
    .insert({
      user_id: userId,
      amount: "0₮",
      track: "course",
      exam_id: examId,
      status: "paid",
      payment_provider: "free",
      paid_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    // A double click lost the race to the one-sitting-per-paper index: use the winner's.
    if (error.code !== "23505") throw error;
    const winner = (await listCourseSittings(userId, [examId])).get(examId);
    if (!winner) throw error;
    return { ok: true, assessmentId: await laidOut(winner, now) };
  }
  await openExamPaper((data as { id: string }).id);
  return { ok: true, assessmentId: (data as { id: string }).id };
}

/** An unfinished sitting made ready to solve — whatever step it was left on. Idempotent. */
async function laidOut(sitting: Assessment, now: Date): Promise<string> {
  if (sitting.status === "awaiting_payment") {
    await updateAssessment(sitting.id, { status: "paid", payment_provider: "free", paid_at: now.toISOString() });
  }
  if (sitting.status === "awaiting_payment" || sitting.status === "paid") await openExamPaper(sitting.id);
  return sitting.id;
}

/**
 * For the routes that change a sitting (upload, skip, submit): a course paper
 * takes work only inside its window. null when the work may go ahead.
 */
export async function courseWindowError(assessment: Pick<Assessment, "track" | "examId">, now = new Date()): Promise<string | null> {
  if (assessment.track !== "course") return null;
  const exam = assessment.examId ? await findExam(assessment.examId) : undefined;
  if (!exam) return "Даалгавар олдсонгүй";
  const window = taskWindow(exam, now);
  if (window === "before") return `${TASK_KIND_LABEL[kindOf(exam)]} хараахан нээгдээгүй байна`;
  if (window === "after") return `${KIND_GENITIVE[kindOf(exam)]} хугацаа дууссан — илгээх боломжгүй`;
  return null;
}

// ---------------------------------------------------------------------------
// Generating a course's papers from its timetable
// ---------------------------------------------------------------------------

export type PlannedTask = { kind: CourseTaskKind; title: string; opensAt: string; closesAt: string; position: number };

const TIME_RANGE = /(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/;
/** «Даалгавар 1: …», «Сорил: …» — not «Сорилын хариу …». */
const TASK_LINE = /^(даалгавар|сорил)(?=[\s:.,—–-]|$)/i;
const pad = (t: string) => (t.length === 4 ? `0${t}` : t);
const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/**
 * Every homework and test the timetable promises: for each week of lessons,
 * each «Даалгавар …» and «Сорил …» line of the weekly rhythm on its day and
 * window. Homework k of a week takes the name of that week's k-th video
 * lesson, a test the week's subjects.
 */
export function planCourseTasks(course: { lessons: { topic: string; schedule?: string }[]; weeklySchedule?: string | null }): PlannedTask[] {
  // In week order, whatever order the lines were typed in: homework is numbered as it opens.
  const weekIndex = (day: string) => (WEEKDAY_NAMES.indexOf(day) + 6) % 7;
  const rhythm = weeklyRhythm(course.weeklySchedule)
    .filter((r) => TASK_LINE.test(r.text) && WEEKDAY_NAMES.includes(r.day))
    .sort((a, b) => weekIndex(a.day) - weekIndex(b.day));
  const planned: Omit<PlannedTask, "position">[] = [];
  let homeworkNo = 0;
  for (const week of courseWeeks(course.lessons)) {
    const videos = week.lessons.filter((l) => l.kind === "video");
    let homeworkInWeek = 0;
    for (const line of rhythm) {
      const day = WEEKDAY_NAMES.indexOf(line.day);
      const range = line.time.match(TIME_RANGE);
      if (day < 0 || !range) continue;
      const date = addDays(week.start, (day + 6) % 7);
      const opensAt = mongoliaLocalToUtc(date, pad(range[1]));
      // «20:00–02:00» closes the next morning.
      const closesSameDay = mongoliaLocalToUtc(date, pad(range[2]));
      const closesAt =
        closesSameDay && opensAt && closesSameDay <= opensAt ? mongoliaLocalToUtc(addDays(date, 1), pad(range[2])) : closesSameDay;
      if (!opensAt || !closesAt) continue;
      const isTest = /^сорил/i.test(line.text);
      const title = isTest
        ? `Сорил ${week.number}: ${week.subjects.join(", ")}`
        : `Даалгавар ${++homeworkNo}: ${videos[homeworkInWeek]?.title ?? week.subjects.join(", ")}`;
      if (!isTest) homeworkInWeek++;
      planned.push({ kind: isTest ? "test" : "homework", title, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() });
    }
  }
  return planned
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
    .map((t, position) => ({ ...t, position }));
}

/**
 * Creates the planned papers a course does not have yet, as drafts with no
 * problems — the teacher fills and opens each. A planned paper is already there
 * when one of its kind opens at its time or holds its place in the order, so a
 * paper whose window the teacher moved is not made again; running it after the
 * timetable grows adds only what is new.
 */
export async function generateCourseTasks(
  programId: string,
  course: { lessons: { topic: string; schedule?: string }[]; weeklySchedule?: string | null }
): Promise<{ created: number; existing: number }> {
  const plan = planCourseTasks(course);
  const have = await listCourseTasks(programId);
  const at = (kind: string, iso: string) => `${kind}@${new Date(iso).getTime()}`;
  const place = (kind: string, position: number) => `${kind}#${position}`;
  const taken = new Set(have.flatMap((t) => [at(t.kind, t.opensAt), place(t.kind, t.position)]));
  const fresh = plan.filter((p) => !taken.has(at(p.kind, p.opensAt)) && !taken.has(place(p.kind, p.position)));
  if (fresh.length > 0) {
    const { error } = await getSupabase()
      .from("exams")
      .insert(
        fresh.map((p) => ({
          title: p.title,
          category: null,
          fee: "0₮",
          status: "draft",
          kind: p.kind,
          program_id: programId,
          opens_at: p.opensAt,
          closes_at: p.closesAt,
          position: p.position,
        }))
      );
    if (error) throw error;
  }
  return { created: fresh.length, existing: plan.length - fresh.length };
}
