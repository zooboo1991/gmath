/**
 * Шаталсан түвшин тогтоолтын цэвэр логик.
 *
 * Мэдээллийн сангийн импортгүй: хариултын шалгалт, шатлах дүрэм, оноолт
 * гурвуулаа энд байгаа тул сервер, тест хоёулаа нэг эх сурвалжаас уншина.
 * Зөв хариулт клиент рүү хэзээ ч явахгүй — шалгалт зөвхөн сервер талд.
 */

/** Сэдэв бүр 2-р түвшнээс эхэлнэ. */
export const PLACEMENT_START_LEVEL = 2;

/** Түвшний нэршил — үр дүнгийн хуудас, AI дүгнэлт хоёулаа үүнийг хэрэглэнэ. */
export const PLACEMENT_LEVEL_LABELS: Record<1 | 2 | 3, string> = {
  1: "1-р түвшин (А)",
  2: "2-р түвшин (B)",
  3: "3-р түвшин (C)",
};

/**
 * Хариултын оролтыг харьцуулахад бэлдэнэ.
 *
 * Хүүхэд "13 / 20", "0,65", " 24" гэх мэтээр бичнэ — эдгээр нь бүгд бичлэгийн
 * ялгаа болохоос мэдлэгийн ялгаа биш. Зай арилгаж, таслалыг цэг болгож,
 * кириллийн х-г латин x болгоно (тэгшитгэлийн хариултад гардаг).
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/х/g, "x")
    .replace(/–|−/g, "-");
}

/** "a/b" хэлбэрийн энгийн бутархайг тоо болгоно; болохгүй бол NaN. */
function toNumber(normalized: string): number {
  const fraction = normalized.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? NaN : Number(fraction[1]) / denominator;
  }
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

/**
 * Өгсөн хариулт зөвшөөрөгдөх жагсаалтын аль нэгтэй тохирох уу.
 *
 * Хоёр шатлалтай: эхлээд нормчилсон текстээр, дараа нь хоёулаа тоо болж
 * уншигдвал тоогоор (0.5 ба 1/2 ижил). Бодлого оруулагч бүх хэлбэрийг
 * урьдчилж таамаглах албагүй болгож байгаа нь энэ.
 */
export function isAnswerCorrect(given: string, accepted: string[]): boolean {
  const normalizedGiven = normalizeAnswer(given);
  if (!normalizedGiven) return false;
  const givenNumber = toNumber(normalizedGiven);

  return accepted.some((candidate) => {
    const normalizedCandidate = normalizeAnswer(candidate);
    if (normalizedCandidate === normalizedGiven) return true;
    const candidateNumber = toNumber(normalizedCandidate);
    return (
      Number.isFinite(givenNumber) &&
      Number.isFinite(candidateNumber) &&
      Math.abs(givenNumber - candidateNumber) < 1e-9
    );
  });
}

/** Нэг сэдвийн явц: өгөгдсөн бодлогууд, зөв эсэх нь. */
export type TopicProgress = {
  topicOrder: number;
  /** Түвшнээр нь: хариулсан алхмууд. Хариулаагүй алхам орохгүй. */
  steps: { level: number; isCorrect: boolean }[];
};

/**
 * Дараагийн асуух түвшин, эсвэл сэдэв дууссан бол null.
 *
 * 2-оос эхэлж: зөв бол 3, буруу бол 1. Хоёр дахь хариултаар сэдэв хаагдана.
 */
export function nextLevelForTopic(progress: TopicProgress): number | null {
  const first = progress.steps.find((s) => s.level === PLACEMENT_START_LEVEL);
  if (!first) return PLACEMENT_START_LEVEL;
  const second = first.isCorrect ? 3 : 1;
  return progress.steps.some((s) => s.level === second) ? null : second;
}

/**
 * Сэдвийн оноо 0-3:
 *   2-т буруу, 1-д буруу → 0
 *   2-т буруу, 1-д зөв  → 1
 *   2-т зөв,  3-т буруу → 2
 *   2-т зөв,  3-т зөв   → 3
 * Хагас дутуу (хугацаа дууссан) сэдэв хамгийн муу таамгаараа тоологдоно —
 * 2-т зөв хариулаад 3-оо амжаагүй бол 2 оноо нь хэвээр үлдэнэ.
 */
export function topicScore(progress: TopicProgress): number {
  const first = progress.steps.find((s) => s.level === PLACEMENT_START_LEVEL);
  if (!first) return 0;
  if (first.isCorrect) {
    const third = progress.steps.find((s) => s.level === 3);
    return third?.isCorrect ? 3 : third ? 2 : 2;
  }
  const easy = progress.steps.find((s) => s.level === 1);
  return easy?.isCorrect ? 1 : 0;
}

/**
 * Ерөнхий түвшин: сэдвүүдийн дундаж оноогоор.
 *   < 1.5   → 1 (А)
 *   1.5-2.5 → 2 (B)
 *   > 2.5   → 3 (C)
 * Босго нь анхны дүрэм — эзэн хожим өөрчилж болно.
 */
export function overallLevel(scores: number[]): 1 | 2 | 3 {
  if (scores.length === 0) return 1;
  const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  if (average < 1.5) return 1;
  if (average <= 2.5) return 2;
  return 3;
}

/**
 * Хариултын талбарын бичих заавар — тухайн бодлогод тохируулсан хариултын
 * хэлбэрээс гаргана.
 *
 * Жишээ тоог жижиг нөөцөөс сонгохдоо тухайн бодлогын зөв хариулттай
 * (текстээр ч, тоогоор ч) давхцахгүйг нь баталгаажуулна — үгүй бол зөв
 * хариулт дэлгэц дээр "жишээ" нэрээр бичээстэй гарчихна. Хэлбэрээ хэлэх нь
 * бичлэгийн алдаанаас хамгаална: 1/3 гэж хадгалсан хариултыг 0.33 гэж
 * бичвэл тоон харьцуулалт (1e-9) тэнцэхгүй тул бутархайгаар бичихийг
 * урьдчилж хэлэх ёстой.
 */
const HINT_EXAMPLES = {
  fraction: ["3/4", "2/5", "5/8", "7/12", "4/9", "11/6"],
  decimal: ["0.75", "0.4", "1.25", "2.6", "0.15", "3.8"],
  integer: ["24", "17", "132", "8", "451", "60"],
} as const;

function hintExample(kind: keyof typeof HINT_EXAMPLES, accepted: string[]): string {
  return (
    HINT_EXAMPLES[kind].find((example) => !isAnswerCorrect(example, accepted)) ??
    HINT_EXAMPLES[kind][0]
  );
}

export function answerFormatHint(accepted: string[]): string {
  const normalized = accepted.map((a) => normalizeAnswer(a)).filter(Boolean);
  const kindOf = (a: string): "fraction" | "decimal" | "integer" | "text" => {
    if (/^-?\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(a)) return "fraction";
    if (/^-?\d+\.\d+$/.test(a)) return "decimal";
    if (/^-?\d+$/.test(a)) return "integer";
    return "text";
  };
  const kinds = new Set(normalized.map(kindOf));

  if (kinds.has("fraction")) {
    // "Аль нь ч болно" гэж зөвхөн бутархай утга бүр нь аравт/бүхэл хэлбэрээрээ
    // мөн зөвшөөрөгдсөн үед л амлана. Үгүй бол (жишээ нь 1/3) аравтаар бичсэн
    // сурагч буруу унах тул бутархайн зааврыг л өгнө.
    const everyFractionHasPlainTwin = normalized
      .filter((a) => kindOf(a) === "fraction")
      .every((fraction) =>
        normalized.some((other) => kindOf(other) !== "fraction" && isAnswerCorrect(other, [fraction]))
      );
    if (everyFractionHasPlainTwin && (kinds.has("decimal") || kinds.has("integer"))) {
      return `Хариултаа энгийн бутархайгаар (жишээ нь: ${hintExample("fraction", accepted)}) эсвэл аравтын бутархайгаар (жишээ нь: ${hintExample("decimal", accepted)}) бичиж болно.`;
    }
    return `Хариултаа энгийн бутархайгаар бичээрэй. Жишээ нь: ${hintExample("fraction", accepted)} гэсэн хэлбэрээр.`;
  }
  if (kinds.has("decimal")) {
    return `Хариултаа аравтын бутархайгаар бичээрэй. Жишээ нь: ${hintExample("decimal", accepted)} гэсэн хэлбэрээр.`;
  }
  if (kinds.has("integer")) {
    return `Хариултаа бүхэл тоогоор бичээрэй. Жишээ нь: ${hintExample("integer", accepted)} гэсэн хэлбэрээр.`;
  }
  return "Хариултаа товч бичээрэй.";
}
