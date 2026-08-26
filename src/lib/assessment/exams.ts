import { getSupabase } from "../supabase";
import { listCourses, listYearlyPrograms } from "../db";
import { attachProblems, findAssessment, problemFromRow, updateAssessment, type ProblemRow } from "./db";
import type { Problem, ProblemCategory } from "./types";

/**
 * Exams — a set of problems the teacher chose, in the order children meet them.
 *
 * The alternative this replaced picked problems automatically by difficulty,
 * one child at a time. That made every paper different, so two results could
 * not be compared and "what was on the test" had no answer. An exam is a thing
 * with a name, a price and a roll of problems, which is what a teacher already
 * means by the word.
 */

export type ExamStatus = "draft" | "open" | "closed";

export type Exam = {
  id: string;
  title: string;
  category: ProblemCategory;
  fee: string;
  status: ExamStatus;
  createdAt: string;
  updatedAt: string;
};

export type ExamDetail = Exam & {
  problems: Problem[];
  /** Courses whose registered students sit this exam for free. */
  freeCourses: { programId: string; label: string }[];
};

type ExamRow = {
  id: string;
  title: string;
  category: ProblemCategory;
  fee: string;
  status: ExamStatus;
  created_at: string;
  updated_at: string;
};

function examFromRow(row: ExamRow): Exam {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    fee: row.fee,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listExams(): Promise<(Exam & { problemCount: number; freeCourseCount: number })[]> {
  const supabase = getSupabase();
  const [{ data: rows, error }, { data: problemRows }, { data: freeRows, error: freeError }] =
    await Promise.all([
      supabase.from("exams").select("*").order("created_at", { ascending: false }),
      supabase.from("exam_problems").select("exam_id"),
      // exam_free_courses, not the exam_free_users table this used to read:
      // that one was dropped when invitations became course-based, and its
      // error went unchecked, so the count sat at zero for every exam.
      supabase.from("exam_free_courses").select("exam_id"),
    ]);
  if (error) throw error;
  if (freeError) throw freeError;

  const countBy = (list: { exam_id: string }[] | null) => {
    const counts = new Map<string, number>();
    for (const r of list ?? []) counts.set(r.exam_id, (counts.get(r.exam_id) ?? 0) + 1);
    return counts;
  };
  const problemCounts = countBy(problemRows as { exam_id: string }[] | null);
  const freeCourseCounts = countBy(freeRows as { exam_id: string }[] | null);

  return (rows as ExamRow[]).map((row) => ({
    ...examFromRow(row),
    problemCount: problemCounts.get(row.id) ?? 0,
    freeCourseCount: freeCourseCounts.get(row.id) ?? 0,
  }));
}

export async function findExam(id: string): Promise<Exam | undefined> {
  const { data, error } = await getSupabase().from("exams").select("*").eq("id", id).maybeSingle();
  if (error) {
    // A malformed id in a URL is "not found", not a crash.
    if ((error as { code?: string }).code === "22P02") return undefined;
    throw error;
  }
  return data ? examFromRow(data as ExamRow) : undefined;
}

/** The exam with everything the admin editor and the student flow need. */
export async function findExamDetail(id: string): Promise<ExamDetail | undefined> {
  const exam = await findExam(id);
  if (!exam) return undefined;
  const [problems, freeCourses] = await Promise.all([listExamProblems(id), listExamFreeCourses(id)]);
  return { ...exam, problems, freeCourses };
}

/** In the teacher's chosen order — that is the order a child sees them in. */
export async function listExamProblems(examId: string): Promise<Problem[]> {
  const { data, error } = await getSupabase()
    .from("exam_problems")
    .select("position, problems(*)")
    .eq("exam_id", examId)
    .order("position");
  if (error) throw error;

  // The embedded row is typed as an array by the client even though it is one.
  type Row = { position: number; problems: ProblemRow | ProblemRow[] | null };
  return (data as unknown as Row[])
    .map((r) => (Array.isArray(r.problems) ? r.problems[0] : r.problems))
    .filter((p): p is ProblemRow => Boolean(p))
    .map(problemFromRow);
}

/** The courses whose students sit this exam free, with a readable label each. */
export async function listExamFreeCourses(examId: string): Promise<{ programId: string; label: string }[]> {
  const { data, error } = await getSupabase()
    .from("exam_free_courses")
    .select("program_id")
    .eq("exam_id", examId);
  if (error) throw error;

  const programIds = (data as { program_id: string }[]).map((r) => r.program_id);
  if (programIds.length === 0) return [];

  // Labels come from whichever table owns the id — the same opaque-id split
  // used everywhere a programme can be a course or a yearly programme.
  const [courses, yearly] = await Promise.all([listCourses(), listYearlyPrograms()]);
  return programIds.map((programId) => {
    const course = courses.find((c) => c.id === programId);
    if (course) return { programId, label: `${course.title} (${course.tag})` };
    const program = yearly.find((p) => p.id === programId);
    return { programId, label: program?.label ?? programId };
  });
}

export async function setExamFreeCourses(examId: string, programIds: string[]): Promise<void> {
  const supabase = getSupabase();
  const { error: clearError } = await supabase.from("exam_free_courses").delete().eq("exam_id", examId);
  if (clearError) throw clearError;
  if (programIds.length === 0) return;

  const { error } = await supabase
    .from("exam_free_courses")
    .insert(programIds.map((programId) => ({ exam_id: examId, program_id: programId })));
  if (error) throw error;
}

export async function createExam(input: {
  title: string;
  category: ProblemCategory;
  fee: string;
}): Promise<Exam> {
  const { data, error } = await getSupabase()
    .from("exams")
    .insert({ title: input.title, category: input.category, fee: input.fee })
    .select("*")
    .single();
  if (error) throw error;
  return examFromRow(data as ExamRow);
}

export async function updateExam(
  id: string,
  patch: Partial<Pick<Exam, "title" | "category" | "fee" | "status">>
): Promise<Exam | undefined> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.fee !== undefined) row.fee = patch.fee;
  if (patch.status !== undefined) row.status = patch.status;

  const { data, error } = await getSupabase()
    .from("exams")
    .update(row)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? examFromRow(data as ExamRow) : undefined;
}

/** Replaces the whole roll, so the order the teacher dragged into place is what sticks. */
export async function setExamProblems(examId: string, problemIds: string[]): Promise<void> {
  const supabase = getSupabase();
  const { error: clearError } = await supabase.from("exam_problems").delete().eq("exam_id", examId);
  if (clearError) throw clearError;
  if (problemIds.length === 0) return;

  const { error } = await supabase
    .from("exam_problems")
    .insert(problemIds.map((problemId, index) => ({ exam_id: examId, problem_id: problemId, position: index })));
  if (error) throw error;
}

export async function deleteExam(id: string): Promise<void> {
  const { error } = await getSupabase().from("exams").delete().eq("id", id);
  if (error) throw error;
}

/**
 * The exam a child of this category would sit right now, or undefined when the
 * teacher has none open for them.
 */
export async function findOpenExam(category: ProblemCategory): Promise<Exam | undefined> {
  const { data, error } = await getSupabase()
    .from("exams")
    .select("*")
    .eq("category", category)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? examFromRow(data as ExamRow) : undefined;
}

/**
 * Whether this child sits this exam without paying: are they an active student
 * on any of the courses the teacher named?
 *
 * Read live rather than copied onto a list, so a child who enrols tomorrow is
 * included tomorrow, and one whose registration is cancelled stops being.
 */
export async function isFreeForUser(examId: string, userId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data: courseRows, error } = await supabase
    .from("exam_free_courses")
    .select("program_id")
    .eq("exam_id", examId);
  if (error) throw error;
  const programIds = (courseRows as { program_id: string }[]).map((r) => r.program_id);
  if (programIds.length === 0) return false;

  const { data, error: regError } = await supabase
    .from("registrations")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("program_id", programIds)
    .limit(1);
  if (regError) throw regError;
  return (data ?? []).length > 0;
}

/**
 * The exam this child may sit free right now, if any.
 *
 * Found through their courses, not their school year. The teacher invites a
 * class — "everyone on the C programme" — and that class contains a fourth
 * grader and a ninth grader who were placed there on ability. Deciding the
 * category from `users.grade` excluded exactly those children from the exam
 * their own teacher had just invited them to.
 *
 * This is also the one thing that reaches past the "түвшин тогтоох хаалттай"
 * switch: the switch closes the door to the public while the problem bank is
 * being rebuilt, but an invited class is not the public.
 */
export type InvitedExam = Exam & { viaProgramId: string };

/**
 * Every exam this child may sit free, one per course that invited them.
 *
 * A child can be on both the C and the D programme — placed on ability, not
 * on school year — and the teacher opened an exam for each. Returning one
 * showed the offer on one card and left the other looking like a mistake.
 */
export async function listFreeInvitedExams(userId: string): Promise<InvitedExam[]> {
  const supabase = getSupabase();
  const { data: regRows, error } = await supabase
    .from("registrations")
    .select("program_id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  const programIds = [...new Set((regRows as { program_id: string }[]).map((r) => r.program_id))];
  if (programIds.length === 0) return [];

  const { data: freeRows, error: freeError } = await supabase
    .from("exam_free_courses")
    .select("exam_id, program_id")
    .in("program_id", programIds);
  if (freeError) throw freeError;
  const invited = (freeRows ?? []) as { exam_id: string; program_id: string }[];
  if (invited.length === 0) return [];

  const { data: examRows, error: examError } = await supabase
    .from("exams")
    .select("*")
    .eq("status", "open")
    .in("id", [...new Set(invited.map((r) => r.exam_id))])
    .order("created_at", { ascending: false });
  if (examError) throw examError;

  return (examRows as ExamRow[]).map((row) => ({
    ...examFromRow(row),
    viaProgramId: invited.find((r) => r.exam_id === row.id)?.program_id ?? programIds[0],
  }));
}

/** The first of them — for the paths that only need to know "is there one". */
export async function findFreeInvitedExam(userId: string): Promise<InvitedExam | undefined> {
  return (await listFreeInvitedExams(userId))[0];
}



/**
 * Lays the exam's paper on a freshly paid assessment and marks it ready to
 * solve, so the child goes from "start" straight to the first problem.
 *
 * The questionnaire used to sit here. It fed the adaptive engine's starting
 * difficulty, and that engine is gone — the teacher chose the problems. What
 * was left was a form standing between a child and the exam they came for.
 *
 * The status stays `questionnaire_done` because that is what every route
 * downstream checks for "may be solved now"; renaming it would be a migration
 * for a word.
 */
export async function openExamPaper(assessmentId: string): Promise<void> {
  const assessment = await findAssessment(assessmentId);
  if (!assessment?.examId) return;
  if (assessment.status !== "paid") return;

  const problems = await listExamProblems(assessment.examId);
  if (problems.length === 0) return;

  await attachProblems(assessmentId, problems.map((p) => p.id));
  await updateAssessment(assessmentId, { status: "questionnaire_done" });
}
