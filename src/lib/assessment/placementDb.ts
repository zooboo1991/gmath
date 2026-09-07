import { getSupabase } from "../supabase";
import { answerFormatHint } from "./placement";
import { parseAnswerTemplate } from "./answerTemplate";
import {
  ANSWER_TYPE_SPECS,
  toPublicBoxes,
  type AnswerBox,
  type AnswerType,
  type PublicAnswerBox,
} from "./answerShape";

/**
 * Шаталсан түвшин тогтоолтын бодлогын сан ба явцын бүртгэл.
 *
 * (grade, topic_order, level) гурвалд яг нэг бодлого ногддог — шат тогтмол
 * байж хүүхдүүдийн дүн харьцуулагдана. Зөв хариултууд (answers) энэ
 * модулиас клиент рүү явдаг ямар ч төрөлд орохгүй.
 */

export type PlacementProblem = {
  id: string;
  grade: number;
  topic: string;
  topicOrder: number;
  level: number;
  bodyLatex: string;
  /** Зөвшөөрөгдөх хариултууд — зөвхөн сервер талд. */
  answers: string[];
  /** Хариултыг хэрхэн авах: чөлөөт бичвэр эсвэл нүдэн хэлбэрүүд. */
  answerType: AnswerType;
  /** Нүд бүрийн зөв утга — зөвхөн сервер талд. */
  answerBoxes: AnswerBox[];
  /** Үсэгт илэрхийллийн загвар, [ ] дотор зөв утгуудтай — зөвхөн сервер талд. */
  answerTemplate: string;
  active: boolean;
  createdAt: string;
};

/** Сурагч руу явдаг хэлбэр: хариултгүй, харин бичих зааврыг хэлбэрээс нь гаргаж дагуулна. */
export type PublicPlacementProblem = Omit<
  PlacementProblem,
  "answers" | "answerBoxes" | "answerTemplate" | "active" | "createdAt"
> & {
  answerHint: string;
  /** Нүдний байрлал ба нэр — зөв утгагүй. */
  answerBoxes: PublicAnswerBox[];
  /** Загвар төрөлд: дугаарласан хоосон нүдтэй LaTeX. Бусад төрөлд хоосон. */
  answerDisplay: string;
};

export function toPublicPlacementProblem(problem: PlacementProblem): PublicPlacementProblem {
  return {
    id: problem.id,
    grade: problem.grade,
    topic: problem.topic,
    topicOrder: problem.topicOrder,
    level: problem.level,
    bodyLatex: problem.bodyLatex,
    answerType: problem.answerType,
    answerBoxes:
      problem.answerType === "template"
        ? // Загварын нүд дугаараараа нэрлэгдэнэ — илэрхийлэл дэх ⬚₁, ⬚₂-той таарна.
          parseAnswerTemplate(problem.answerTemplate).values.map((_, i) => ({ label: String(i + 1) }))
        : toPublicBoxes(problem.answerBoxes),
    answerDisplay:
      problem.answerType === "template" ? parseAnswerTemplate(problem.answerTemplate).display : "",
    answerHint:
      problem.answerType === "text"
        ? answerFormatHint(problem.answers)
        : ANSWER_TYPE_SPECS[problem.answerType].hint,
  };
}

type ProblemRow = {
  id: string;
  grade: number;
  topic: string;
  topic_order: number;
  level: number;
  body_latex: string;
  answers: string[];
  answer_type: AnswerType;
  answer_boxes: AnswerBox[];
  answer_template: string;
  active: boolean;
  created_at: string;
};

function problemFromRow(row: ProblemRow): PlacementProblem {
  return {
    id: row.id,
    grade: row.grade,
    topic: row.topic,
    topicOrder: row.topic_order,
    level: row.level,
    bodyLatex: row.body_latex,
    answers: row.answers ?? [],
    answerType: row.answer_type ?? "text",
    answerBoxes: row.answer_boxes ?? [],
    answerTemplate: row.answer_template ?? "",
    active: row.active,
    createdAt: row.created_at,
  };
}

export async function listPlacementProblems(filter: {
  grade?: number;
  activeOnly?: boolean;
}): Promise<PlacementProblem[]> {
  let query = getSupabase()
    .from("placement_problems")
    .select("*")
    .order("grade")
    .order("topic_order")
    .order("level");
  if (filter.grade !== undefined) query = query.eq("grade", filter.grade);
  if (filter.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data as ProblemRow[]).map(problemFromRow);
}

export async function findPlacementProblem(id: string): Promise<PlacementProblem | undefined> {
  const { data, error } = await getSupabase()
    .from("placement_problems")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? problemFromRow(data as ProblemRow) : undefined;
}

export async function createPlacementProblem(input: {
  grade: number;
  topic: string;
  topicOrder: number;
  level: number;
  bodyLatex: string;
  answers: string[];
  answerType: AnswerType;
  answerBoxes: AnswerBox[];
  answerTemplate: string;
  active: boolean;
}): Promise<PlacementProblem> {
  const { data, error } = await getSupabase()
    .from("placement_problems")
    .insert({
      grade: input.grade,
      topic: input.topic,
      topic_order: input.topicOrder,
      level: input.level,
      body_latex: input.bodyLatex,
      answers: input.answers,
      answer_type: input.answerType,
      answer_boxes: input.answerBoxes,
      answer_template: input.answerTemplate,
      active: input.active,
    })
    .select("*")
    .single();
  if (error) throw error;
  return problemFromRow(data as ProblemRow);
}

export async function updatePlacementProblem(
  id: string,
  input: Partial<
    Pick<
      PlacementProblem,
      | "topic"
      | "topicOrder"
      | "level"
      | "bodyLatex"
      | "answers"
      | "answerType"
      | "answerBoxes"
      | "answerTemplate"
      | "active"
    >
  >
): Promise<PlacementProblem | undefined> {
  const patch: Record<string, unknown> = {};
  if (input.topic !== undefined) patch.topic = input.topic;
  if (input.topicOrder !== undefined) patch.topic_order = input.topicOrder;
  if (input.level !== undefined) patch.level = input.level;
  if (input.bodyLatex !== undefined) patch.body_latex = input.bodyLatex;
  if (input.answers !== undefined) patch.answers = input.answers;
  if (input.answerType !== undefined) patch.answer_type = input.answerType;
  if (input.answerBoxes !== undefined) patch.answer_boxes = input.answerBoxes;
  if (input.answerTemplate !== undefined) patch.answer_template = input.answerTemplate;
  if (input.active !== undefined) patch.active = input.active;

  const { data, error } = await getSupabase()
    .from("placement_problems")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? problemFromRow(data as ProblemRow) : undefined;
}

export async function deletePlacementProblem(id: string): Promise<void> {
  const { error } = await getSupabase().from("placement_problems").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Явцын алхмууд
// ---------------------------------------------------------------------------

export type PlacementStep = {
  id: string;
  assessmentId: string;
  problemId: string;
  topicOrder: number;
  level: number;
  shownOrder: number;
  givenAnswer?: string;
  isCorrect?: boolean;
  answeredAt?: string;
  createdAt: string;
};

type StepRow = {
  id: string;
  assessment_id: string;
  problem_id: string;
  topic_order: number;
  level: number;
  shown_order: number;
  given_answer: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
  created_at: string;
};

function stepFromRow(row: StepRow): PlacementStep {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    problemId: row.problem_id,
    topicOrder: row.topic_order,
    level: row.level,
    shownOrder: row.shown_order,
    givenAnswer: row.given_answer ?? undefined,
    isCorrect: row.is_correct ?? undefined,
    answeredAt: row.answered_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listPlacementSteps(assessmentId: string): Promise<PlacementStep[]> {
  const { data, error } = await getSupabase()
    .from("placement_steps")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("shown_order");
  if (error) throw error;
  return (data as StepRow[]).map(stepFromRow);
}

/**
 * Дараагийн бодлогыг олгоно. unique(assessment_id, problem_id) тул хоёр таб
 * зэрэг хүсвэл нэг нь 23505-д уначихаад байгаагаа дахин уншина — quiz-ийн
 * угсрах үеийн ижил хамгаалалт.
 */
export async function createPlacementStep(input: {
  assessmentId: string;
  problemId: string;
  topicOrder: number;
  level: number;
  shownOrder: number;
}): Promise<PlacementStep | undefined> {
  const { data, error } = await getSupabase()
    .from("placement_steps")
    .insert({
      assessment_id: input.assessmentId,
      problem_id: input.problemId,
      topic_order: input.topicOrder,
      level: input.level,
      shown_order: input.shownOrder,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") return undefined;
    throw error;
  }
  return data ? stepFromRow(data as StepRow) : undefined;
}

/**
 * Хариултыг нэг л удаа бичнэ: is_correct нь null мөрийг л шинэчилдэг тул
 * давхар илгээлт хоёр дахь удаа юу ч өөрчлөхгүй.
 */
export async function answerPlacementStep(input: {
  stepId: string;
  givenAnswer: string;
  isCorrect: boolean;
}): Promise<PlacementStep | undefined> {
  const { data, error } = await getSupabase()
    .from("placement_steps")
    .update({
      given_answer: input.givenAnswer,
      is_correct: input.isCorrect,
      answered_at: new Date().toISOString(),
    })
    .eq("id", input.stepId)
    .is("is_correct", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? stepFromRow(data as StepRow) : undefined;
}
