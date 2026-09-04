import { isTooLong } from "../validate";

/**
 * Бодлогын оролтын нэг шалгагч — POST/PUT хоёулаа үүгээр орно.
 *
 * Идэвхжүүлэхийн тулд хариулт ЗААВАЛ байх ёстой: хариултгүй бодлого
 * "асуугдаад хэн ч зөв гарахгүй" гэсэн үг тул тэр төлөвт орохыг эндээс
 * хориглоно.
 */
export type PlacementProblemInput = {
  grade: number;
  topic: string;
  topicOrder: number;
  level: number;
  bodyLatex: string;
  answers: string[];
  active: boolean;
};

const MAX_BODY = 2000;
const MAX_TOPIC = 100;
const MAX_ANSWER = 120;
const MAX_ANSWERS = 8;

export function validatePlacementProblemInput(
  data: unknown
): { ok: true; value: PlacementProblemInput } | { ok: false; error: string } {
  const d = (data ?? {}) as Record<string, unknown>;

  const grade = Number(d.grade);
  if (!Number.isInteger(grade) || grade < 4 || grade > 12) {
    return { ok: false, error: "Анги 4-12 хооронд байна" };
  }
  const topicOrder = Number(d.topicOrder);
  if (!Number.isInteger(topicOrder) || topicOrder < 1 || topicOrder > 30) {
    return { ok: false, error: "Сэдвийн дараалал 1-30 хооронд байна" };
  }
  const level = Number(d.level);
  if (![1, 2, 3].includes(level)) {
    return { ok: false, error: "Түвшин 1, 2, 3-ын аль нэг байна" };
  }
  const topic = typeof d.topic === "string" ? d.topic.trim() : "";
  if (!topic) return { ok: false, error: "Сэдвийн нэрийг бөглөнө үү" };
  if (isTooLong(topic, MAX_TOPIC)) return { ok: false, error: "Сэдвийн нэр хэт урт байна" };

  const bodyLatex = typeof d.bodyLatex === "string" ? d.bodyLatex.trim() : "";
  if (!bodyLatex) return { ok: false, error: "Бодлогын эхийг бөглөнө үү" };
  if (isTooLong(bodyLatex, MAX_BODY)) return { ok: false, error: "Бодлогын эх хэт урт байна" };

  const answers = Array.isArray(d.answers)
    ? d.answers
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, MAX_ANSWERS)
    : [];
  if (answers.some((a) => isTooLong(a, MAX_ANSWER))) {
    return { ok: false, error: "Хариулт хэт урт байна" };
  }

  const active = d.active === true;
  if (active && answers.length === 0) {
    return { ok: false, error: "Хариултгүй бодлогыг идэвхжүүлэх боломжгүй — эхлээд хариултаа оруулна уу" };
  }

  return { ok: true, value: { grade, topic, topicOrder, level, bodyLatex, answers, active } };
}
