import { getSupabase } from "../supabase";
import type { Assessment } from "./types";
import {
  isAnswerCorrect,
  nextLevelForTopic,
  overallLevel,
  topicScore,
  PLACEMENT_LEVEL_LABELS,
} from "./placement";
import {
  answerPlacementStep,
  createPlacementStep,
  listPlacementProblems,
  listPlacementSteps,
  toPublicPlacementProblem,
  type PlacementProblem,
  type PlacementStep,
  type PublicPlacementProblem,
} from "./placementDb";
import { getPlacementMinutes, setQuizRecommendation } from "./db";
import { writePlacementRecommendation } from "./placementRecommendation";

/**
 * Шаталсан шалгалтын явцын нэг алхам: одоо юу асуухыг шийдэж, хариултыг
 * шалгаж, дуусмагц дүгнэнэ.
 *
 * Бүх шийдвэр сервер талд: клиент зөвхөн "одоогийн бодлого юу вэ" гэж асууж,
 * хариултаа илгээнэ. Зөв хариулт, дараагийн мөчир хоёулаа энд л мэдэгдэнэ.
 */

export type PlacementView =
  | {
      done: false;
      problem: PublicPlacementProblem;
      /** Хэддэх асуулт (1-ээс), нийт хэд байх нь. */
      position: number;
      total: number;
      /** Хугацаа дуусах хүртэл үлдсэн секунд. Эхлээгүй бол бүтэн хугацаа. */
      remainingSeconds: number;
    }
  | { done: true; result: PlacementResult };

export type PlacementResult = {
  level: 1 | 2 | 3;
  levelLabel: string;
  topics: { topicOrder: number; topic: string; score: number }[];
  answered: number;
  total: number;
};

/** Гурван түвшин бүрэн, идэвхтэй сэдвүүд л шалгалтад орно. */
function completeTopics(problems: PlacementProblem[]): Map<number, PlacementProblem[]> {
  const byOrder = new Map<number, PlacementProblem[]>();
  for (const p of problems) {
    const list = byOrder.get(p.topicOrder) ?? [];
    list.push(p);
    byOrder.set(p.topicOrder, list);
  }
  for (const [order, list] of byOrder) {
    const levels = new Set(list.map((p) => p.level));
    if (!levels.has(1) || !levels.has(2) || !levels.has(3)) byOrder.delete(order);
  }
  return new Map([...byOrder.entries()].sort((a, b) => a[0] - b[0]));
}

function progressOf(steps: PlacementStep[], topicOrder: number) {
  return {
    topicOrder,
    steps: steps
      .filter((s) => s.topicOrder === topicOrder && s.isCorrect !== undefined)
      .map((s) => ({ level: s.level, isCorrect: s.isCorrect === true })),
  };
}

async function deadline(steps: PlacementStep[]): Promise<{ startedAt?: number; limitMs: number }> {
  const minutes = await getPlacementMinutes();
  const first = steps[0];
  return {
    startedAt: first ? new Date(first.createdAt).getTime() : undefined,
    limitMs: minutes * 60 * 1000,
  };
}

/** Дүгнэлт: сэдвийн оноонууд + ерөнхий түвшин. Аль ч үед дуудаж болно. */
function summarise(
  topics: Map<number, PlacementProblem[]>,
  steps: PlacementStep[]
): PlacementResult {
  const rows = [...topics.entries()].map(([order, list]) => ({
    topicOrder: order,
    topic: list[0].topic,
    score: topicScore(progressOf(steps, order)),
  }));
  const level = overallLevel(rows.map((r) => r.score));
  return {
    level,
    levelLabel: PLACEMENT_LEVEL_LABELS[level],
    topics: rows,
    answered: steps.filter((s) => s.isCorrect !== undefined).length,
    total: topics.size * 2,
  };
}

/**
 * Дуусгана: статусыг paid → completed нэг л удаа эргүүлж (нөхцөлт UPDATE),
 * хожсон дуудалт нь AI дүгнэлтээ бичнэ. Давхар дуудалт юу ч давхардуулахгүй.
 */
async function finalize(
  assessment: Assessment,
  topics: Map<number, PlacementProblem[]>,
  steps: PlacementStep[]
): Promise<PlacementResult> {
  const result = summarise(topics, steps);

  const { data, error } = await getSupabase()
    .from("assessments")
    .update({ status: "completed", estimated_level: result.level })
    .eq("id", assessment.id)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();
  if (error) throw error;

  if (data) {
    // Зөвхөн статусыг эргүүлсэн дуудалт AI дүгнэлт бичнэ — үр дүнгийн
    // дэлгэц үүнийг шууд харуулах тул синхроноор хүлээнэ.
    const text = await writePlacementRecommendation({
      grade: assessment.quizGrade ?? 0,
      result,
    });
    await setQuizRecommendation(assessment.id, text).catch((err) =>
      console.error("[placement] recommendation save failed", assessment.id, err)
    );
  }
  return result;
}

/**
 * Одоогийн байдал: дараагийн бодлого, эсвэл дууссан бол үр дүн.
 *
 * Шинэ бодлого олгохдоо placement_steps-т мөр үүсгэнэ — unique түлхүүр нь
 * хоёр таб зэрэг ажилласан ч нэг л мөр үлдээнэ.
 */
export async function placementState(assessment: Assessment): Promise<PlacementView> {
  if (!assessment.quizGrade) throw new Error("placement needs a grade");
  const problems = await listPlacementProblems({ grade: assessment.quizGrade, activeOnly: true });
  const topics = completeTopics(problems);
  const steps = await listPlacementSteps(assessment.id);

  if (assessment.status === "completed") {
    return { done: true, result: summarise(topics, steps) };
  }
  if (topics.size === 0) {
    throw new PlacementNotReadyError();
  }

  const { startedAt, limitMs } = await deadline(steps);
  if (startedAt !== undefined && Date.now() - startedAt > limitMs) {
    return { done: true, result: await finalize(assessment, topics, steps) };
  }

  // Хариулаагүй өгөгдчихсөн бодлого байвал түүнийгээ л дахин үзүүлнэ.
  const open = steps.find((s) => s.isCorrect === undefined);
  const byId = new Map(problems.map((p) => [p.id, p]));
  if (open) {
    const problem = byId.get(open.problemId);
    if (problem) {
      return view(problem, steps, topics, startedAt, limitMs);
    }
  }

  // Дараагийн сэдэв, дараагийн түвшин.
  for (const [order, list] of topics) {
    const next = nextLevelForTopic(progressOf(steps, order));
    if (next === null) continue;
    const problem = list.find((p) => p.level === next);
    if (!problem) continue; // бүрэн биш сэдэв аль хэдийн шүүгдсэн — хамгаалалт
    const created = await createPlacementStep({
      assessmentId: assessment.id,
      problemId: problem.id,
      topicOrder: order,
      level: next,
      shownOrder: steps.length + 1,
    });
    // Уралдаанд ялагдвал (хоёр таб) шинэ байдлаа дахин уншина.
    if (!created) return placementState(assessment);
    return view(problem, [...steps, created], topics, startedAt ?? Date.now(), limitMs);
  }

  return { done: true, result: await finalize(assessment, topics, steps) };
}

export class PlacementNotReadyError extends Error {
  constructor() {
    super("Энэ ангийн шалгалт хараахан бэлэн болоогүй байна.");
  }
}

function view(
  problem: PlacementProblem,
  steps: PlacementStep[],
  topics: Map<number, PlacementProblem[]>,
  startedAt: number | undefined,
  limitMs: number
): PlacementView {
  const answered = steps.filter((s) => s.isCorrect !== undefined).length;
  const elapsed = startedAt === undefined ? 0 : Date.now() - startedAt;
  return {
    done: false,
    problem: toPublicPlacementProblem(problem),
    position: answered + 1,
    total: topics.size * 2,
    remainingSeconds: Math.max(0, Math.floor((limitMs - elapsed) / 1000)),
  };
}

/**
 * Хариулт хүлээж авна. Хугацаа дууссан бол хариултыг тоолохгүй шууд дүгнэнэ.
 * Зөв эсэхийг клиентэд хэлэхгүй — мөчир нь өөрөө хэлчихнэ гэсэн шүүмж бий ч,
 * дэлгэц дээр шууд "буруу" гэж бичихгүй байх нь хүүхдийг шалгалтын дундуур
 * шантрахаас хамгаална.
 */
export async function placementAnswer(
  assessment: Assessment,
  givenAnswer: string
): Promise<PlacementView> {
  if (!assessment.quizGrade) throw new Error("placement needs a grade");
  const steps = await listPlacementSteps(assessment.id);
  const open = steps.find((s) => s.isCorrect === undefined);
  if (!open) return placementState(assessment);

  const { startedAt, limitMs } = await deadline(steps);
  if (startedAt !== undefined && Date.now() - startedAt > limitMs) {
    return placementState(assessment); // дотроо дүгнэчихнэ
  }

  const problems = await listPlacementProblems({ grade: assessment.quizGrade, activeOnly: true });
  const problem = problems.find((p) => p.id === open.problemId);
  if (!problem) return placementState(assessment);

  await answerPlacementStep({
    stepId: open.id,
    givenAnswer: givenAnswer.slice(0, 200),
    isCorrect: isAnswerCorrect(givenAnswer, problem.answers),
  });
  return placementState(assessment);
}
