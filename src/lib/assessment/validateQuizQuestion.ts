import type { QuizQuestion, QuizTrack } from "./types";

const MAX_BODY = 2000;
const MAX_CHOICE = 400;
const MAX_TOPIC = 100;

export type QuizQuestionInput = Omit<QuizQuestion, "id" | "active" | "createdAt">;

/**
 * One validator for both the create and edit routes, so the rules can't
 * drift apart. Returns the normalised input rather than a boolean — the
 * routes then insert exactly what was validated.
 */
export function validateQuizQuestionInput(
  data: unknown
): { ok: true; value: QuizQuestionInput } | { ok: false; error: string } {
  const d = data as Record<string, unknown> | null;
  if (!d) return { ok: false, error: "Хүсэлт хоосон байна" };

  const track = d.track;
  if (track !== "regular" && track !== "advanced") {
    return { ok: false, error: "Төрөл буруу байна (Энгийн эсвэл Сонгон)" };
  }
  const grade = Number(d.grade);
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) {
    return { ok: false, error: "Анги 1-12 хооронд байх ёстой" };
  }
  const body = typeof d.bodyLatex === "string" ? d.bodyLatex.trim() : "";
  if (!body) return { ok: false, error: "Асуултын эх бичвэрийг оруулна уу" };
  if (body.length > MAX_BODY) return { ok: false, error: "Асуулт хэт урт байна" };

  const rawChoices = Array.isArray(d.choices) ? d.choices : [];
  const choices = rawChoices.map((c) => (typeof c === "string" ? c.trim() : ""));
  if (choices.length !== 4 || choices.some((c) => !c)) {
    return { ok: false, error: "Дөрвөн хариултын сонголтыг бүгдийг бөглөнө үү" };
  }
  if (choices.some((c) => c.length > MAX_CHOICE)) {
    return { ok: false, error: "Хариултын сонголт хэт урт байна" };
  }

  const correctIndex = Number(d.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return { ok: false, error: "Зөв хариултаа тэмдэглэнэ үү" };
  }
  const topic = typeof d.topic === "string" ? d.topic.trim() : "";
  if (topic.length > MAX_TOPIC) return { ok: false, error: "Сэдэв хэт урт байна" };

  return {
    ok: true,
    value: { track: track as QuizTrack, grade, topic, bodyLatex: body, choices, correctIndex },
  };
}
