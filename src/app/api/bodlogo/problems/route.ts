/**
 * Бодлого хувилах систем (bodlogo)-оос нийтлэгдсэн бодлогыг хүлээн авна.
 *
 * Тэр систем `GMATH_API_URL=https://gmath.mn/api/bodlogo` тохируулаад энд
 * `POST` хийнэ. Payload-ийн эх сурвалж нь тэр талын
 * `bodlogo/adapters/gmath_payload.schema.json` — доорх шалгалт түүнийг тусгав.
 * Схемийг өөрчилвөл ХОЁР талд зэрэг өөрчилнө.
 *
 * `external_id` нь идемпотент түлхүүр: publish командыг дахин ажиллуулахад
 * шинэ бодлого үүсэхгүй, байгаа нь шинэчлэгдэнэ.
 *
 * Ирсэн бодлого бодлогын банкинд ОРДОГГҮЙ — хүлээлгийн санд буудаг. Багш
 * админаас харж, сонгож байж банк руу татна. Тиймээс энэ түлхүүр алдагдсан
 * ч хэн нэг нь хүүхдийн шалгалтад юу ч оруулж чадахгүй.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  BODLOGO_ANSWER_TYPES,
  upsertBodlogoProblem,
  type BodlogoAnswerType,
} from "@/lib/bodlogo/db";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set([
  "external_id",
  "template_id",
  "family_id",
  "grade",
  "topic",
  "level",
  "text",
  "solution",
  "answer",
  "tags",
  "source",
  // AI багшийн өгөгдөл. Заавал биш — түүнээс өмнө үүссэн загварууд үүнгүй ирнэ.
  "tutor",
]);
const REQUIRED_KEYS = [...ALLOWED_KEYS].filter((key) => key !== "tutor");
const ALLOWED_ANSWER_KEYS = new Set(["type", "value", "display", "unit", "tolerance"]);

type Payload = {
  external_id: string;
  template_id: string;
  family_id: string;
  grade: number;
  topic: string | null;
  level: number;
  text: string;
  solution: string;
  answer: {
    type: BodlogoAnswerType;
    value: string;
    display: string;
    unit: string | null;
    tolerance: number | null;
  };
  tags: string[];
  source: "generated";
  tutor?: unknown;
};

/** Бүх алдааг цуглуулж нэг дор буцаана — нэг нэгээр нь засуулах нь удаан. */
function validate(body: unknown): string[] {
  const errors: string[] = [];
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return ["payload нь объект байх ёстой"];
  }
  const payload = body as Record<string, unknown>;

  for (const key of Object.keys(payload)) {
    // Номын нэр, хуудасны дугаар зэрэг гарал үүслийн мэдээлэл энд орох ёсгүй —
    // танихгүй талбарыг чимээгүй орхихын оронд татгалзана.
    if (!ALLOWED_KEYS.has(key)) errors.push(`танихгүй талбар: ${key}`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in payload)) errors.push(`дутуу талбар: ${key}`);
  }

  const str = (key: string, pattern?: RegExp) => {
    const value = payload[key];
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`${key} нь хоосон биш тэмдэгт мөр байх ёстой`);
    } else if (pattern && !pattern.test(value)) {
      errors.push(`${key} нь загварт тохирохгүй: ${value}`);
    }
  };
  str("external_id", /^var_[0-9]{6,}$/);
  str("template_id", /^tpl_[0-9]{6,}$/);
  str("family_id", /^fam_[0-9]{6,}$/);
  str("text");
  str("solution");

  if (!Number.isInteger(payload.grade) || (payload.grade as number) < 1 || (payload.grade as number) > 12) {
    errors.push("grade нь 1..12 бүхэл тоо байх ёстой");
  }
  if (![1, 2, 3].includes(payload.level as number)) errors.push("level нь 1, 2 эсвэл 3 байна");
  if (payload.source !== "generated") errors.push('source нь "generated" байх ёстой');
  if (payload.topic !== null && typeof payload.topic !== "string") {
    errors.push("topic нь тэмдэгт мөр эсвэл null");
  }
  if (!Array.isArray(payload.tags) || payload.tags.some((tag) => typeof tag !== "string" || !tag)) {
    errors.push("tags нь хоосон биш мөрүүдийн массив байна");
  } else if (new Set(payload.tags as string[]).size !== (payload.tags as string[]).length) {
    errors.push("tags давхардсан байна");
  }

  const answer = payload.answer as Record<string, unknown> | undefined;
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
    errors.push("answer нь объект байх ёстой");
  } else {
    for (const key of Object.keys(answer)) {
      if (!ALLOWED_ANSWER_KEYS.has(key)) errors.push(`answer.${key} танихгүй`);
    }
    for (const key of ALLOWED_ANSWER_KEYS) {
      if (!(key in answer)) errors.push(`answer.${key} дутуу`);
    }
    if (!(BODLOGO_ANSWER_TYPES as readonly string[]).includes(answer.type as string)) {
      errors.push("answer.type танихгүй");
    }
    if (typeof answer.value !== "string" || !answer.value) errors.push("answer.value хоосон");
    if (typeof answer.display !== "string" || !answer.display) errors.push("answer.display хоосон");
    if (answer.unit !== null && (typeof answer.unit !== "string" || !answer.unit)) {
      errors.push("answer.unit нь хоосон биш мөр эсвэл null");
    }
    if (answer.tolerance !== null && (typeof answer.tolerance !== "number" || answer.tolerance <= 0)) {
      errors.push("answer.tolerance нь эерэг тоо эсвэл null");
    }
  }

  if ("tutor" in payload && payload.tutor !== null && typeof payload.tutor !== "object") {
    errors.push("tutor нь объект эсвэл null");
  }
  return errors;
}

/**
 * Түлхүүр тохируулаагүй бол хаалттай. Тохируулаагүй орчинд энэ зам нээлттэй
 * үлдэх нь хамгийн муу төгсгөл тул анхдагч байдал нь "үгүй".
 */
function authorised(request: Request): boolean {
  const key = process.env.BODLOGO_API_KEY ?? "";
  if (!key) return false;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorised(request)) {
    return NextResponse.json({ detail: "Зөвшөөрөлгүй." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "JSON биш." }, { status: 400 });
  }

  const errors = validate(body);
  if (errors.length) {
    return NextResponse.json({ detail: errors.join("; ") }, { status: 422 });
  }

  const payload = body as Payload;
  try {
    const saved = await upsertBodlogoProblem({
      externalId: payload.external_id,
      templateId: payload.template_id,
      familyId: payload.family_id,
      grade: payload.grade,
      topic: payload.topic,
      level: payload.level,
      bodyLatex: payload.text,
      solutionMn: payload.solution,
      answerType: payload.answer.type,
      answerValue: payload.answer.value,
      answerDisplay: payload.answer.display,
      answerUnit: payload.answer.unit,
      answerTolerance: payload.answer.tolerance,
      tags: payload.tags,
      tutor: payload.tutor ?? null,
    });
    return NextResponse.json({ id: saved.id }, { status: 200 });
  } catch (error) {
    // Дотоод алдааны текст (SQL, зам, стек) хариунд гарахгүй — зөвхөн логт.
    console.error("[bodlogo] upsert алдаа", payload.external_id, error);
    return NextResponse.json({ detail: "Хадгалахад алдаа гарлаа." }, { status: 500 });
  }
}
