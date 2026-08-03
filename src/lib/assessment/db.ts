import { getPaymentProvider } from "../payment";
import { getSupabase } from "../supabase";
import { publicUserFromJoin, type PublicUser } from "../db";
import { DEFAULT_ASSESSMENT_FEE, MAX_PROBLEMS_SHOWN, PROBLEMS_TO_SOLVE } from "./config";
import { estimateLevel } from "./levelEstimator";
import { nextTargetDifficulty, pickNextProblem } from "./problemPicker";
import type {
  Assessment,
  AssessmentProblem,
  AssessmentStatus,
  Level,
  Problem,
  ProblemAction,
  QuestionnaireAnswers,
  QuestionnaireInput,
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

type ProblemRow = {
  id: string;
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
  status: AssessmentStatus;
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

function problemFromRow(row: ProblemRow): Problem {
  return {
    id: row.id,
    level: row.level,
    // Postgres numeric comes back as a string through PostgREST.
    difficulty: Number(row.difficulty),
    topic: row.topic,
    bodyLatex: row.body_latex ?? undefined,
    imageUrl: row.image_url ?? undefined,
    answerKey: row.answer_key ?? undefined,
    active: row.active,
    createdAt: row.created_at,
  };
}

function assessmentFromRow(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    estimatedLevel: row.estimated_level ?? undefined,
    finalLevel: row.final_level ?? undefined,
    teacherComment: row.teacher_comment ?? undefined,
    gradedSheetPath: row.graded_sheet_path ?? undefined,
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

export async function getAssessmentFee(): Promise<string> {
  return (await getSetting("assessment_fee")) ?? DEFAULT_ASSESSMENT_FEE;
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

export async function listProblems(opts: { includeInactive?: boolean } = {}): Promise<Problem[]> {
  let query = getSupabase().from("problems").select("*").order("difficulty").order("created_at");
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data as ProblemRow[]).map(problemFromRow);
}

export type ProblemInput = Omit<Problem, "id" | "createdAt">;

export async function createProblem(input: ProblemInput): Promise<Problem> {
  const { data, error } = await getSupabase()
    .from("problems")
    .insert({
      level: input.level,
      difficulty: input.difficulty,
      topic: input.topic,
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
  if (input.level !== undefined) patch.level = input.level;
  if (input.difficulty !== undefined) patch.difficulty = input.difficulty;
  if (input.topic !== undefined) patch.topic = input.topic;
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
export async function findOpenAssessment(userId: string): Promise<Assessment | undefined> {
  const all = await listAssessmentsByUser(userId);
  return all.find((a) => a.status !== "completed");
}

export async function createAssessment(userId: string, amount: string): Promise<Assessment> {
  const { data, error } = await getSupabase()
    .from("assessments")
    .insert({ user_id: userId, amount })
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
  return updateAssessment(id, {
    status: "paid",
    payment_ref: result.reference,
    paid_at: result.paidAt,
  });
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
  /** Problems the student has committed to solving. */
  chosen: AssessmentProblem[];
  /** Everything shown so far, whatever the answer. */
  shown: AssessmentProblem[];
  targetDifficulty: number;
  /** True once enough problems are chosen (or the bank ran dry). */
  finished: boolean;
};

/**
 * Replays the recorded answers to work out where the difficulty target has
 * drifted to. Storing only the actions (not the running target) keeps the
 * tuning in problemPicker.ts — change the step size and old assessments
 * re-derive consistently.
 */
export async function getPickingState(assessment: Assessment): Promise<PickingState> {
  const shown = await listAssessmentProblems(assessment.id);
  let target = assessment.estimatedLevel ?? 1;
  for (const entry of shown) {
    target = nextTargetDifficulty(target, entry.action);
  }
  const chosen = shown.filter((s) => s.action === "solving");
  return {
    chosen,
    shown,
    targetDifficulty: target,
    finished: chosen.length >= PROBLEMS_TO_SOLVE || shown.length >= MAX_PROBLEMS_SHOWN,
  };
}

/** Null when the student is done, or the bank has nothing new to offer. */
export async function getNextProblem(assessment: Assessment): Promise<Problem | null> {
  const state = await getPickingState(assessment);
  if (state.finished) return null;
  const candidates = await listProblems();
  return pickNextProblem(
    candidates,
    state.targetDifficulty,
    state.shown.map((s) => s.problemId)
  );
}

export async function recordProblemAction(
  assessmentId: string,
  problemId: string,
  action: ProblemAction,
  shownOrder: number
): Promise<AssessmentProblem> {
  const { data, error } = await getSupabase()
    .from("assessment_problems")
    .insert({
      assessment_id: assessmentId,
      problem_id: problemId,
      action,
      shown_order: shownOrder,
    })
    .select("*")
    .single();
  if (error) throw error;
  return assessmentProblemFromRow(data as AssessmentProblemRow);
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
