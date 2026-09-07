import { isTooLong } from "../validate";
import {
  ANSWER_TYPES,
  ANSWER_TYPE_SPECS,
  boxesAreComplete,
  type AnswerBox,
  type AnswerType,
} from "./answerShape";
import { validateAnswerTemplate } from "./answerTemplate";

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
  answerType: AnswerType;
  answerBoxes: AnswerBox[];
  answerTemplate: string;
  active: boolean;
};

const MAX_BODY = 2000;
const MAX_TOPIC = 100;
const MAX_ANSWER = 120;
const MAX_ANSWERS = 8;
const MAX_BOXES = 6;
const MAX_BOX_VALUE = 20;
const MAX_BOX_LABEL = 24;
const MAX_TEMPLATE = 300;

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

  const answerType: AnswerType = ANSWER_TYPES.includes(d.answerType as AnswerType)
    ? (d.answerType as AnswerType)
    : "text";

  const answerBoxes: AnswerBox[] = Array.isArray(d.answerBoxes)
    ? d.answerBoxes
        .slice(0, MAX_BOXES)
        .map((raw) => {
          const b = (raw ?? {}) as Record<string, unknown>;
          const value = typeof b.value === "string" ? b.value.trim() : "";
          const label = typeof b.label === "string" ? b.label.trim() : "";
          return label ? { value, label } : { value };
        })
    : [];

  const answerTemplate = typeof d.answerTemplate === "string" ? d.answerTemplate.trim() : "";

  if (answerType === "template") {
    // Хоосон загварыг ноорог байдлаар зөвшөөрнө — идэвхжүүлэхэд л шаардана.
    if (answerTemplate) {
      const check = validateAnswerTemplate(answerTemplate);
      if (!check.ok) return { ok: false, error: check.error };
    }
    if (isTooLong(answerTemplate, MAX_TEMPLATE)) {
      return { ok: false, error: "Загвар хэт урт байна" };
    }
  } else if (answerType !== "text") {
    const expected = ANSWER_TYPE_SPECS[answerType].boxes;
    if (expected !== null && answerBoxes.length !== expected) {
      return { ok: false, error: `Энэ төрөлд ${expected} нүд байх ёстой` };
    }
    if (expected === null && answerBoxes.length < 2) {
      return { ok: false, error: "Дор хаяж хоёр нүд хэрэгтэй" };
    }
    if (answerBoxes.some((b) => isTooLong(b.value, MAX_BOX_VALUE))) {
      return { ok: false, error: "Нүдний утга хэт урт байна" };
    }
    if (answerBoxes.some((b) => b.label !== undefined && isTooLong(b.label, MAX_BOX_LABEL))) {
      return { ok: false, error: "Нүдний нэр хэт урт байна" };
    }
  }

  const active = d.active === true;
  // Идэвхжихийн тулд шалгах юмтай байх ёстой: чөлөөт бичвэрт хариулт,
  // нүдэн төрөлд нүд бүр бөглөгдсөн байна.
  if (active) {
    const ready =
      answerType === "text"
        ? answers.length > 0
        : answerType === "template"
          ? validateAnswerTemplate(answerTemplate).ok
          : boxesAreComplete(answerType, answerBoxes);
    if (!ready) {
      return {
        ok: false,
        error: "Хариултгүй бодлогыг идэвхжүүлэх боломжгүй — эхлээд хариултаа оруулна уу",
      };
    }
  }

  return {
    ok: true,
    value: {
      grade,
      topic,
      topicOrder,
      level,
      bodyLatex,
      answers,
      answerType,
      answerBoxes,
      answerTemplate,
      active,
    },
  };
}
