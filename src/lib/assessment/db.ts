import { getPaymentProvider } from "../payment";
import { getSupabase } from "../supabase";
import { publicUserFromJoin, type PublicUser } from "../db";
import {
  DEFAULT_ASSESSMENT_FEE,
  DEFAULT_ASSESSMENT_SLA,
  DEFAULT_QUIZ_FEE,
  QUIZ_QUESTIONS_PER_TEST,
} from "./config";
import { estimateLevel } from "./levelEstimator";
import { isProblemCategory } from "./types";
import type {
  Assessment,
  AssessmentProblem,
  AssessmentStatus,
  AssessmentTrack,
  Level,
  Problem,
  ProblemAction,
  QuestionnaireAnswers,
  QuestionnaireInput,
  QuizAnswer,
  QuizQuestion,
  ProblemCategory,
  QuizTrack,
  Solution,
} from "./types";

/**
 * Every Supabase call for the assessment feature. Mirrors the conventions in
 * lib/db.ts: row types, `xFromRow` mappers, throw on error, and access is
 * gated by the calling API route (service_role bypasses RLS).
 */

/** An assessment plus the student it belongs to, for the admin queue. */
export type AssessmentWithUser = Assessment & { user?: PublicUser };

function isInvalidUuidError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "22P02";
}

// ---------------------------------------------------------------------------
// Row types + mappers
// ---------------------------------------------------------------------------

type LevelRow = {
  id: number;
  name: string;
  description: string;
  scope: string;
  how_to_advance: string;
  recommended_course_id: string | null;
};

export type ProblemRow = {
  id: string;
  category: string | null;
  level: number;
  difficulty: number | string;
  topic: string;
  body_latex: string | null;
  image_url: string | null;
  answer_key: string | null;
  active: boolean;
  created_at: string;
};

type AssessmentRow = {
  id: string;
  user_id: string;
  exam_id: string | null;
  category: string | null;
  graded_sheet_paths: string[] | null;
  status: AssessmentStatus;
  track: AssessmentTrack;
  quiz_grade: number | null;
  quiz_score: number | null;
  quiz_total: number | null;
  ai_recommendation: string | null;
  estimated_level: number | null;
  final_level: number | null;
  teacher_comment: string | null;
  graded_sheet_path: string | null;
  payment_provider: string;
  payment_ref: string | null;
  payment_invoice_id: string | null;
  payment_qr_image: string | null;
  payment_short_url: string | null;
  amount: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type QuestionnaireRow = {
  id: string;
  assessment_id: string;
  age: number | null;
  grade: string;
  has_competed: boolean;
  has_prepared: boolean;
  achievements: string;
  created_at: string;
};

type AssessmentProblemRow = {
  id: string;
  assessment_id: string;
  problem_id: string;
  action: ProblemAction;
  shown_order: number;
  created_at: string;
};

type SolutionRow = {
  id: string;
  assessment_id: string;
  problem_id: string;
  image_paths: string[] | null;
  grader_score: number | string | null;
  grader_comment: string | null;
  graded_at: string | null;
  created_at: string;
};

function levelFromRow(row: LevelRow): Level {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    howToAdvance: row.how_to_advance,
    recommendedCourseId: row.recommended_course_id ?? undefined,
  };
}

export function problemFromRow(row: ProblemRow): Problem {
  return {
    id: row.id,
    level: row.level,
    // Postgres numeric comes back as a string through PostgREST.
    difficulty: Number(row.difficulty),
    topic: row.topic,
    bodyLatex: row.body_latex ?? undefined,
    imageUrl: row.image_url ?? undefined,
    answerKey: row.answer_key ?? undefined,
    category: isProblemCategory(row.category) ? row.category : undefined,
    active: row.active,
    createdAt: row.created_at,
  };
}

function assessmentFromRow(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    track: row.track,
    category: isProblemCategory(row.category) ? row.category : undefined,
    examId: row.exam_id ?? undefined,
    quizGrade: row.quiz_grade ?? undefined,
    quizScore: row.quiz_score ?? undefined,
    quizTotal: row.quiz_total ?? undefined,
    aiRecommendation: row.ai_recommendation ?? undefined,
    estimatedLevel: row.estimated_level ?? undefined,
    finalLevel: row.final_level ?? undefined,
    teacherComment: row.teacher_comment ?? undefined,
    gradedSheetPath: row.graded_sheet_path ?? undefined,
    gradedSheetPaths: row.graded_sheet_paths ?? [],
    paymentProvider: row.payment_provider,
    paymentRef: row.payment_ref ?? undefined,
    paymentInvoiceId: row.payment_invoice_id ?? undefined,
    paymentQrImage: row.payment_qr_image ?? undefined,
    paymentShortUrl: row.payment_short_url ?? undefined,
    amount: row.amount ?? undefined,
    paidAt: row.paid_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function questionnaireFromRow(row: QuestionnaireRow): QuestionnaireAnswers {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    age: row.age ?? undefined,
    grade: row.grade,
    hasCompeted: row.has_competed,
    hasPrepared: row.has_prepared,
    achievements: row.achievements,
    createdAt: row.created_at,
  };
}

function assessmentProblemFromRow(row: AssessmentProblemRow): AssessmentProblem {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    problemId: row.problem_id,
    action: row.action,
    shownOrder: row.shown_order,
    createdAt: row.created_at,
  };
}

function solutionFromRow(row: SolutionRow): Solution {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    problemId: row.problem_id,
    imagePaths: row.image_paths ?? [],
    graderScore: row.grader_score === null ? undefined : Number(row.grader_score),
    graderComment: row.grader_comment ?? undefined,
    gradedAt: row.graded_at ?? undefined,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | undefined> {
  const { data, error } = await getSupabase()
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return (data as { value: string } | null)?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await getSupabase()
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

/**
 * Whether the level test is open to students at all.
 *
 * A kill switch rather than a code change, because the reason to close it is
 * always temporary and always urgent: the problem bank is mid-rewrite and the
 * test would hand children questions that are half-replaced. The admin flips
 * it back the same day, without a deploy.
 *
 * Default is open — a missing row, or a database that cannot be read, must
 * never silently take the feature away.
 */
export async function isAssessmentOpen(): Promise<boolean> {
  const value = await getSetting("assessment_enabled").catch(() => undefined);
  return value !== "off";
}

export async function getAssessmentFee(): Promise<string> {
  return (await getSetting("assessment_fee")) ?? DEFAULT_ASSESSMENT_FEE;
}

export async function getQuizFee(): Promise<string> {
  return (await getSetting("quiz_fee")) ?? DEFAULT_QUIZ_FEE;
}

/** How long the teacher's verdict takes, as shown to parents before they pay. */
export async function getAssessmentSla(): Promise<string> {
  return (await getSetting("assessment_sla")) ?? DEFAULT_ASSESSMENT_SLA;
}

/** The price an assessment of this track starts at. */
export async function getFeeForTrack(track: AssessmentTrack): Promise<string> {
  return track === "olympiad" ? getAssessmentFee() : getQuizFee();
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export async function listLevels(): Promise<Level[]> {
  const { data, error } = await getSupabase().from("levels").select("*").order("id");
  if (error) throw error;
  return (data as LevelRow[]).map(levelFromRow);
}

export async function findLevel(id: number): Promise<Level | undefined> {
  const { data, error } = await getSupabase().from("levels").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? levelFromRow(data as LevelRow) : undefined;
}

export async function updateLevel(
  id: number,
  input: Partial<Omit<Level, "id">>
): Promise<Level | undefined> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.scope !== undefined) patch.scope = input.scope;
  if (input.howToAdvance !== undefined) patch.how_to_advance = input.howToAdvance;
  if (input.recommendedCourseId !== undefined) {
    patch.recommended_course_id = input.recommendedCourseId || null;
  }

  const { data, error } = await getSupabase()
    .from("levels")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? levelFromRow(data as LevelRow) : undefined;
}

// ---------------------------------------------------------------------------
// Problem bank
// ---------------------------------------------------------------------------

export async function listProblems(
  opts: { includeInactive?: boolean; category?: ProblemCategory } = {}
): Promise<Problem[]> {
  let query = getSupabase().from("problems").select("*").order("created_at");
  if (!opts.includeInactive) query = query.eq("active", true);
  if (opts.category) query = query.eq("category", opts.category);
  const { data, error } = await query;
  if (error) throw error;
  return (data as ProblemRow[]).map(problemFromRow);
}

export type ProblemInput = Omit<Problem, "id" | "createdAt">;

export async function createProblem(input: ProblemInput): Promise<Problem> {
  const { data, error } = await getSupabase()
    .from("problems")
    .insert({
      topic: input.topic,
      category: input.category ?? null,
      body_latex: input.bodyLatex || null,
      image_url: input.imageUrl || null,
      answer_key: input.answerKey ?? null,
      active: input.active,
    })
    .select("*")
    .single();
  if (error) throw error;
  return problemFromRow(data as ProblemRow);
}

export async function updateProblem(
  id: string,
  input: Partial<ProblemInput>
): Promise<Problem | undefined> {
  const patch: Record<string, unknown> = {};
  if (input.topic !== undefined) patch.topic = input.topic;
  if (input.category !== undefined) patch.category = input.category ?? null;
  if (input.bodyLatex !== undefined) patch.body_latex = input.bodyLatex || null;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl || null;
  if (input.answerKey !== undefined) patch.answer_key = input.answerKey || null;
  if (input.active !== undefined) patch.active = input.active;

  const { data, error } = await getSupabase()
    .from("problems")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? problemFromRow(data as ProblemRow) : undefined;
}

/**
 * Soft delete. A hard delete is blocked by the FK from assessment_problems
 * anyway — past assessments must keep referencing the problem they showed.
 */
export async function deactivateProblem(id: string): Promise<boolean> {
  const updated = await updateProblem(id, { active: false });
  return Boolean(updated);
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

export async function findAssessment(id: string): Promise<Assessment | undefined> {
  const { data, error } = await getSupabase().from("assessments").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? assessmentFromRow(data as AssessmentRow) : undefined;
}

export async function listAssessmentsByUser(userId: string): Promise<Assessment[]> {
  const { data, error } = await getSupabase()
    .from("assessments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as AssessmentRow[]).map(assessmentFromRow);
}

/** The one the student is still working through, if any. */
/**
 * The assessment this child is part-way through.
 *
 * Scoped to one exam when asked, because a child invited to both the C and the
 * D programme is invited to both exams. Without the scope, pressing "start" on
 * the D card resumed their unfinished C paper — the same child, a different
 * exam, and no way to tell them apart.
 */
export async function findOpenAssessment(
  userId: string,
  examId?: string
): Promise<Assessment | undefined> {
  const all = await listAssessmentsByUser(userId);
  const open = all.filter((a) => a.status !== "completed");
  if (!examId) return open[0];
  return open.find((a) => a.examId === examId);
}

export async function createAssessment(
  userId: string,
  amount: string,
  track: AssessmentTrack,
  quizGrade?: number,
  category?: ProblemCategory,
  examId?: string
): Promise<Assessment> {
  const { data, error } = await getSupabase()
    .from("assessments")
    .insert({
      user_id: userId,
      amount,
      track,
      quiz_grade: quizGrade ?? null,
      category: category ?? null,
      exam_id: examId ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return assessmentFromRow(data as AssessmentRow);
}

export async function updateAssessment(
  id: string,
  patch: Record<string, unknown>
): Promise<Assessment | undefined> {
  const { data, error } = await getSupabase()
    .from("assessments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? assessmentFromRow(data as AssessmentRow) : undefined;
}

/**
 * Re-checks a still-awaiting-payment assessment's QPay invoice and marks it
 * paid if QPay confirms it settled. Safe to call repeatedly — from the
 * callback, a client poll, or a manual "Шалгах" click — since a payment that
 * isn't actually paid yet is just a no-op that returns the assessment as-is.
 */
export async function settleAssessmentPayment(id: string): Promise<Assessment | undefined> {
  const assessment = await findAssessment(id);
  if (!assessment || assessment.status !== "awaiting_payment" || !assessment.paymentInvoiceId) {
    return assessment;
  }
  const result = await getPaymentProvider().checkPayment(assessment.paymentInvoiceId);
  if (!result.paid) return assessment;

  // Scoped to status="awaiting_payment" so a duplicate/concurrent call (the
  // QPay webhook and a client poll can genuinely land at nearly the same
  // time) can't both "win" this transition — mirrors the same guard on
  // settleRegistrationPayment() in lib/db.ts.
  const { data, error } = await getSupabase()
    .from("assessments")
    .update({
      status: "paid",
      payment_ref: result.reference,
      paid_at: result.paidAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "awaiting_payment")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? assessmentFromRow(data as AssessmentRow) : await findAssessment(id);
}

/**
 * Grading queue: everything submitted but not yet finished, oldest first so
 * the student who has waited longest is graded next. Joined to users because
 * a queue of bare UUIDs is unusable.
 */
export async function listAssessmentsForGrading(): Promise<AssessmentWithUser[]> {
  const { data, error } = await getSupabase()
    .from("assessments")
    .select("*, users(*)")
    .in("status", ["problems_submitted", "grading"])
    .order("created_at");
  if (error) throw error;

  return (data as (AssessmentRow & { users: unknown })[]).map((row) => {
    const { users, ...rest } = row;
    return { ...assessmentFromRow(rest), user: publicUserFromJoin(users) };
  });
}

/** Finished assessments, newest first — the admin's record of past results. */
export async function listCompletedAssessments(): Promise<AssessmentWithUser[]> {
  const { data, error } = await getSupabase()
    .from("assessments")
    .select("*, users(*)")
    .eq("status", "completed")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data as (AssessmentRow & { users: unknown })[]).map((row) => {
    const { users, ...rest } = row;
    return { ...assessmentFromRow(rest), user: publicUserFromJoin(users) };
  });
}

// ---------------------------------------------------------------------------
// Questionnaire
// ---------------------------------------------------------------------------

export async function findQuestionnaire(assessmentId: string): Promise<QuestionnaireAnswers | undefined> {
  const { data, error } = await getSupabase()
    .from("questionnaire_answers")
    .select("*")
    .eq("assessment_id", assessmentId)
    .maybeSingle();
  if (error) throw error;
  return data ? questionnaireFromRow(data as QuestionnaireRow) : undefined;
}

/**
 * Saves the answers, derives the starting level, and moves the assessment on
 * to the problem-picking phase.
 */
export async function saveQuestionnaire(
  assessmentId: string,
  input: QuestionnaireInput
): Promise<{ questionnaire: QuestionnaireAnswers; estimatedLevel: number }> {
  const { data, error } = await getSupabase()
    .from("questionnaire_answers")
    .upsert(
      {
        assessment_id: assessmentId,
        age: input.age ?? null,
        grade: input.grade,
        has_competed: input.hasCompeted,
        has_prepared: input.hasPrepared,
        achievements: input.achievements,
      },
      { onConflict: "assessment_id" }
    )
    .select("*")
    .single();
  if (error) throw error;

  const estimatedLevel = estimateLevel(input);
  await updateAssessment(assessmentId, {
    estimated_level: estimatedLevel,
    status: "questionnaire_done",
  });
  return { questionnaire: questionnaireFromRow(data as QuestionnaireRow), estimatedLevel };
}

/**
 * Writes the exam's roll onto the assessment as ordinary "solving" rows, so
 * everything downstream — the solve page, the uploads, the grading queue —
 * works exactly as it did when the child picked the problems themselves.
 *
 * Idempotent: re-submitting the questionnaire is allowed (a student may go
 * back and correct an answer) and must not hand them the paper twice. Lives
 * here rather than inside saveQuestionnaire so this module keeps no import of
 * the exams module, which already imports this one.
 */
/**
 * Marks one problem on the paper as given up on, or takes that back.
 *
 * Stored in the action column the adaptive engine used to write: "dont_know"
 * meant the same thing then, and reusing it keeps the paper in one table.
 */
export async function setProblemSkipped(
  assessmentId: string,
  problemId: string,
  skipped: boolean
): Promise<void> {
  const { error } = await getSupabase()
    .from("assessment_problems")
    .update({ action: skipped ? "dont_know" : "solving" })
    .eq("assessment_id", assessmentId)
    .eq("problem_id", problemId);
  if (error) throw error;
}

export async function attachProblems(assessmentId: string, problemIds: string[]): Promise<void> {
  if (problemIds.length === 0) return;
  const existing = await listAssessmentProblems(assessmentId);
  if (existing.length > 0) return;

  const { error } = await getSupabase()
    .from("assessment_problems")
    .insert(
      problemIds.map((problemId, index) => ({
        assessment_id: assessmentId,
        problem_id: problemId,
        action: "solving",
        shown_order: index,
      }))
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Problem picking
// ---------------------------------------------------------------------------

export async function listAssessmentProblems(assessmentId: string): Promise<AssessmentProblem[]> {
  const { data, error } = await getSupabase()
    .from("assessment_problems")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("shown_order");
  if (error) throw error;
  return (data as AssessmentProblemRow[]).map(assessmentProblemFromRow);
}

export type PickingState = {
  /** The problems this child must solve — the exam's roll. */
  chosen: AssessmentProblem[];
  /** Every row on the assessment. Identical to `chosen` since the teacher composes the paper. */
  shown: AssessmentProblem[];
};

/**
 * Replays the recorded answers to work out where the difficulty target has
 * drifted to. Storing only the actions (not the running target) keeps the
 * tuning in problemPicker.ts — change the step size and old assessments
 * re-derive consistently.
 */
/**
 * The problems this child has to solve — the exam's roll, written onto the
 * assessment by attachProblems.
 *
 * Once an adaptive walk, hence the name and the "shown"/"chosen" split: every
 * row is now action="solving" because the teacher chose them. Kept as one
 * function because the solve page, the upload endpoint and the submit check
 * all ask the same question of it.
 */
export async function getPickingState(assessment: Assessment): Promise<PickingState> {
  const shown = await listAssessmentProblems(assessment.id);
  const chosen = shown.filter((s) => s.action === "solving");
  return { chosen, shown };
}

// ---------------------------------------------------------------------------
// Solutions
// ---------------------------------------------------------------------------

export async function listSolutions(assessmentId: string): Promise<Solution[]> {
  const { data, error } = await getSupabase()
    .from("solutions")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("created_at");
  if (error) throw error;
  return (data as SolutionRow[]).map(solutionFromRow);
}

export async function upsertSolution(
  assessmentId: string,
  problemId: string,
  imagePaths: string[]
): Promise<Solution> {
  const { data, error } = await getSupabase()
    .from("solutions")
    .upsert(
      { assessment_id: assessmentId, problem_id: problemId, image_paths: imagePaths },
      { onConflict: "assessment_id,problem_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return solutionFromRow(data as SolutionRow);
}

export async function gradeSolution(
  id: string,
  input: { graderScore?: number; graderComment?: string }
): Promise<Solution | undefined> {
  const patch: Record<string, unknown> = { graded_at: new Date().toISOString() };
  if (input.graderScore !== undefined) patch.grader_score = input.graderScore;
  if (input.graderComment !== undefined) patch.grader_comment = input.graderComment;

  const { data, error } = await getSupabase()
    .from("solutions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? solutionFromRow(data as SolutionRow) : undefined;
}

// ---------------------------------------------------------------------------
// Quiz (regular / advanced tracks)
// ---------------------------------------------------------------------------

type QuizQuestionRow = {
  id: string;
  track: QuizTrack;
  grade: number;
  topic: string;
  body_latex: string;
  choices: string[];
  correct_index: number;
  active: boolean;
  sample: boolean;
  created_at: string;
};

type QuizAnswerRow = {
  id: string;
  assessment_id: string;
  question_id: string;
  shown_order: number;
  chosen_index: number | null;
  is_correct: boolean | null;
  created_at: string;
};

function quizQuestionFromRow(row: QuizQuestionRow): QuizQuestion {
  return {
    id: row.id,
    track: row.track,
    grade: row.grade,
    topic: row.topic,
    bodyLatex: row.body_latex,
    choices: row.choices,
    correctIndex: row.correct_index,
    active: row.active,
    sample: row.sample,
    createdAt: row.created_at,
  };
}

function quizAnswerFromRow(row: QuizAnswerRow): QuizAnswer {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    questionId: row.question_id,
    shownOrder: row.shown_order,
    chosenIndex: row.chosen_index ?? undefined,
    isCorrect: row.is_correct ?? undefined,
    createdAt: row.created_at,
  };
}

/** Admin bank view. `activeOnly: false` keeps soft-deleted questions listed (greyed out). */
export async function listQuizQuestions(filter?: {
  track?: QuizTrack;
  grade?: number;
  activeOnly?: boolean;
  /** true = only free samples, false = only paid-test questions, undefined = both. */
  sample?: boolean;
}): Promise<QuizQuestion[]> {
  let query = getSupabase().from("quiz_questions").select("*").order("created_at", { ascending: false });
  if (filter?.track) query = query.eq("track", filter.track);
  if (filter?.grade) query = query.eq("grade", filter.grade);
  if (filter?.activeOnly) query = query.eq("active", true);
  if (filter?.sample !== undefined) query = query.eq("sample", filter.sample);
  const { data, error } = await query;
  if (error) throw error;
  return (data as QuizQuestionRow[]).map(quizQuestionFromRow);
}

export async function addQuizQuestion(
  input: Omit<QuizQuestion, "id" | "active" | "createdAt" | "sample"> & { sample?: boolean }
): Promise<QuizQuestion> {
  const { data, error } = await getSupabase()
    .from("quiz_questions")
    .insert({
      track: input.track,
      grade: input.grade,
      topic: input.topic,
      body_latex: input.bodyLatex,
      choices: input.choices,
      correct_index: input.correctIndex,
      sample: input.sample ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return quizQuestionFromRow(data as QuizQuestionRow);
}

export async function updateQuizQuestion(
  id: string,
  input: Partial<Omit<QuizQuestion, "id" | "createdAt">>
): Promise<QuizQuestion | undefined> {
  const patch: Record<string, unknown> = {};
  if (input.track !== undefined) patch.track = input.track;
  if (input.grade !== undefined) patch.grade = input.grade;
  if (input.topic !== undefined) patch.topic = input.topic;
  if (input.bodyLatex !== undefined) patch.body_latex = input.bodyLatex;
  if (input.choices !== undefined) patch.choices = input.choices;
  if (input.correctIndex !== undefined) patch.correct_index = input.correctIndex;
  if (input.active !== undefined) patch.active = input.active;
  if (input.sample !== undefined) patch.sample = input.sample;

  const { data, error } = await getSupabase()
    .from("quiz_questions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? quizQuestionFromRow(data as QuizQuestionRow) : undefined;
}

/** How many active questions each grade has, per track — the admin list header and the picker's guard. */
export async function countQuizQuestionsByGrade(track: QuizTrack): Promise<Record<number, number>> {
  const { data, error } = await getSupabase()
    .from("quiz_questions")
    .select("grade")
    .eq("track", track)
    .eq("active", true)
    .eq("sample", false);
  if (error) throw error;
  const counts: Record<number, number> = {};
  for (const row of data as { grade: number }[]) {
    counts[row.grade] = (counts[row.grade] ?? 0) + 1;
  }
  return counts;
}

/**
 * Assembles the attempt's question set once, at first request, and returns it
 * (without answers) on every later call — so a refresh resumes the same test
 * instead of re-rolling for easier questions.
 *
 * Random pick happens in JS over the ids only; the bank per (track, grade) is
 * small enough that this is simpler and no slower than a DB-side shuffle.
 */
export async function getOrAssembleQuiz(
  assessment: Assessment
): Promise<{ questions: QuizQuestion[]; answers: QuizAnswer[] }> {
  if (assessment.track === "olympiad" || !assessment.quizGrade) {
    throw new Error("not a quiz assessment");
  }

  const existing = await listQuizAnswers(assessment.id);
  if (existing.length > 0) {
    const questions = await listQuizQuestionsByIds(existing.map((a) => a.questionId));
    const byId = new Map(questions.map((q) => [q.id, q]));
    return {
      questions: existing
        .map((a) => byId.get(a.questionId))
        .filter((q): q is QuizQuestion => Boolean(q)),
      answers: existing,
    };
  }

  const bank = await listQuizQuestions({
    track: assessment.track,
    grade: assessment.quizGrade,
    activeOnly: true,
    // Never the free taster's questions: a parent who tried those must not be
    // asked the same five again after paying.
    sample: false,
  });
  if (bank.length === 0) return { questions: [], answers: [] };

  const picked = shuffle(bank).slice(0, QUIZ_QUESTIONS_PER_TEST);
  const rows = picked.map((q, i) => ({
    assessment_id: assessment.id,
    question_id: q.id,
    shown_order: i + 1,
  }));
  // Ignore a unique-violation race (two tabs assembling at once): whoever lost
  // simply reads the winner's set on the next call.
  const { data, error } = await getSupabase().from("quiz_answers").insert(rows).select("*");
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return getOrAssembleQuiz(assessment);
    }
    throw error;
  }
  return { questions: picked, answers: (data as QuizAnswerRow[]).map(quizAnswerFromRow) };
}

async function listQuizAnswers(assessmentId: string): Promise<QuizAnswer[]> {
  const { data, error } = await getSupabase()
    .from("quiz_answers")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("shown_order");
  if (error) throw error;
  return (data as QuizAnswerRow[]).map(quizAnswerFromRow);
}

async function listQuizQuestionsByIds(ids: string[]): Promise<QuizQuestion[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase().from("quiz_questions").select("*").in("id", ids);
  if (error) throw error;
  return (data as QuizQuestionRow[]).map(quizQuestionFromRow);
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Scores a submitted quiz. The answer key never leaves the server: the client
 * sends only {questionId → chosenIndex}, correctness is decided here.
 *
 * The status flip is conditional on still being 'paid', so a double submit
 * (two tabs, a retried request) scores exactly once — the same conditional-
 * update pattern the QPay settle and the article-notify cron use.
 */
export async function scoreQuiz(
  assessment: Assessment,
  chosen: Record<string, number>
): Promise<{ scored: boolean; score: number; total: number; wrongTopics: string[] }> {
  const { questions, answers } = await getOrAssembleQuiz(assessment);
  const byId = new Map(questions.map((q) => [q.id, q]));

  let score = 0;
  const wrongTopics: string[] = [];
  const updates = answers.map((a) => {
    const q = byId.get(a.questionId);
    const pick = chosen[a.questionId];
    const chosenIndex = typeof pick === "number" && pick >= 0 && pick <= 3 ? pick : null;
    const isCorrect = q !== undefined && chosenIndex !== null && chosenIndex === q.correctIndex;
    if (isCorrect) score += 1;
    else if (q) wrongTopics.push(q.topic || "бусад");
    // The unchanged columns ride along because an upsert replaces the whole
    // row; leaving them out would blank `shown_order` and break the ordering
    // the result page reads back.
    return {
      id: a.id,
      assessment_id: a.assessmentId,
      question_id: a.questionId,
      shown_order: a.shownOrder,
      chosen_index: chosenIndex,
      is_correct: isCorrect,
    };
  });

  // Claim the assessment first; only the winner writes answer rows.
  const { data: claimed, error: claimError } = await getSupabase()
    .from("assessments")
    .update({
      status: "completed",
      quiz_score: score,
      quiz_total: answers.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assessment.id)
    .eq("status", "paid")
    .select("id");
  if (claimError) throw claimError;
  if ((claimed as { id: string }[]).length === 0) {
    return { scored: false, score: 0, total: answers.length, wrongTopics: [] };
  }

  // One round trip for the whole sheet. It used to be one UPDATE per question,
  // so a 10-question quiz paid ten times the latency and could halt half-marked
  // if the connection dropped between two of them.
  const { error: answerError } = await getSupabase().from("quiz_answers").upsert(updates);
  if (answerError) throw answerError;

  return { scored: true, score, total: answers.length, wrongTopics };
}

/** Stores the AI-written (or fallback) recommendation on a completed quiz. */
export async function setQuizRecommendation(assessmentId: string, text: string): Promise<void> {
  const { error } = await getSupabase()
    .from("assessments")
    .update({ ai_recommendation: text, updated_at: new Date().toISOString() })
    .eq("id", assessmentId);
  if (error) throw error;
}
