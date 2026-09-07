/**
 * Хариултыг ЭЕШ-ын 2-р хэсгийн маягаар нүдээр авах.
 *
 * Асуудал: "3 бүхэл 3-ны 1"-ийг чөлөөт бичвэрээр авахад сурагч ч, багш ч
 * ямар хэлбэрээр бичихээ мэдэхгүй. Нүд бол хэлбэрийг урьдчилан тогтоож
 * өгдөг — сурагч зөвхөн цифр нөхнө, эргэлзэх зүйлгүй.
 *
 * Энэ модуль мэдээллийн сангаас хамааралгүй цэвэр логик: төрлийн жагсаалт,
 * шалгах, унших хэлбэрт хөрвүүлэх гурав. Зөв утгууд клиент рүү хэзээ ч
 * явахгүй — публик хэлбэрт зөвхөн нүдний тоо, нэр л үлдэнэ.
 */

import { isAnswerCorrect, normalizeAnswer } from "./placement";

export const ANSWER_TYPES = [
  "text",
  "integer",
  "decimal",
  "fraction",
  "mixed",
  "radical",
  "list",
  "template",
] as const;

export type AnswerType = (typeof ANSWER_TYPES)[number];

/** Нэг нүд: зөв утга ба (сонголтоор) сурагчид харагдах нэр — "x", "ХИЕХ". */
export type AnswerBox = { value: string; label?: string };

/** Сурагч руу явдаг хэлбэр: утгагүй, зөвхөн нүдний байрлал ба нэр. */
export type PublicAnswerBox = { label?: string };

type TypeSpec = {
  /** Админд харагдах нэр. */
  label: string;
  /** Тогтмол нүдний тоо; list-д хувьсах тул null. */
  boxes: number | null;
  /** Нүд бүрийн анхдагч нэр — админд юу хаана орохыг ойлгуулна. */
  slots?: string[];
  /** Сурагчид харагдах богино заавар. */
  hint: string;
};

export const ANSWER_TYPE_SPECS: Record<AnswerType, TypeSpec> = {
  text: {
    label: "Чөлөөт бичвэр",
    boxes: null,
    hint: "Хариултаа бичнэ үү.",
  },
  integer: {
    label: "Бүхэл тоо",
    boxes: 1,
    slots: ["тоо"],
    hint: "Бүхэл тоог нүдэнд бичнэ. Сөрөг бол хасахыг нь мөн бич.",
  },
  decimal: {
    label: "Аравтын бутархай",
    boxes: 1,
    slots: ["тоо"],
    hint: "Аравтын бутархайг нүдэнд бичнэ (жишээ нь: 3.5).",
  },
  fraction: {
    label: "Энгийн бутархай",
    boxes: 2,
    slots: ["хүртэгч", "хуваарь"],
    hint: "Бутархайг хамгийн энгийн хэлбэрт шилжүүлж, дээд, доод нүдэнд бич.",
  },
  mixed: {
    label: "Холимог тоо",
    boxes: 3,
    slots: ["бүхэл", "хүртэгч", "хуваарь"],
    hint: "Бүхэл хэсгийг зүүн нүдэнд, бутархайг хамгийн энгийн хэлбэрээр баруун нүднүүдэд бич.",
  },
  radical: {
    label: "Язгуур (a√b)",
    boxes: 2,
    slots: ["үржигдэхүүн", "язгуур доторх"],
    hint: "Язгуурын өмнөх тоог зүүн, язгуур доторх тоог баруун нүдэнд бич.",
  },
  list: {
    label: "Хэд хэдэн тоо",
    boxes: null,
    hint: "Нүд бүрд харгалзах тоог бич.",
  },
  template: {
    label: "Үсэгт илэрхийлэл (загвараар)",
    boxes: null,
    hint: "Илэрхийллийн дугаарласан хоосон нүд бүрд харгалзах утгыг доор бич.",
  },
};

/** Тухайн төрөлд байх ёстой нүдний тоо; хувьсах бол өгөгдсөн тоог хүлээнэ. */
export function boxCountFor(type: AnswerType, provided: number): number {
  return ANSWER_TYPE_SPECS[type].boxes ?? provided;
}

/** Нүдэнд бичигдэх ёстой бүх утга бөглөгдсөн үү. */
export function boxesAreComplete(type: AnswerType, boxes: AnswerBox[]): boolean {
  if (type === "text") return true;
  const expected = ANSWER_TYPE_SPECS[type].boxes;
  if (expected !== null && boxes.length !== expected) return false;
  if (expected === null && boxes.length < (type === "template" ? 1 : 2)) return false;
  return boxes.every((b) => b.value.trim() !== "");
}

/**
 * Нүднүүдийг уншигдах нэг мөр болгоно — түүхэнд хадгалах, админд харуулахад.
 * Бутархайг "7/2", холимогийг "3 1/2", язгуурыг "2√3" гэж бичнэ.
 */
export function renderBoxedAnswer(type: AnswerType, values: string[]): string {
  const v = values.map((x) => x.trim());
  switch (type) {
    case "fraction":
      return `${v[0] ?? ""}/${v[1] ?? ""}`;
    case "mixed":
      return `${v[0] ?? ""} ${v[1] ?? ""}/${v[2] ?? ""}`.trim();
    case "radical":
      return `${v[0] ?? ""}√${v[1] ?? ""}`;
    case "list":
    case "template":
      return v.join("; ");
    default:
      return v.join(" ");
  }
}

/**
 * Нүд бүрийг тусад нь харьцуулна.
 *
 * Нүдний утга бол нэг тоо тул "05" ба "5", "-0" ба "0" ижил гэж үзэхэд
 * isAnswerCorrect-ийн тоон харьцуулалт хангалттай. Бутархайг богиносгох
 * үүрэг сурагчид үлдэнэ — хэлбэрийг нүд өөрөө тогтоож өгсөн (7/2 гэсэн
 * түлхүүрт 14/4 таарахгүй), үүнийг зааварт хэлнэ.
 */
export function isBoxedAnswerCorrect(expected: AnswerBox[], given: string[]): boolean {
  if (expected.length === 0) return false;
  if (given.length !== expected.length) return false;
  return expected.every((box, i) => {
    const typed = given[i] ?? "";
    if (normalizeAnswer(typed) === "") return false;
    return isAnswerCorrect(typed, [box.value]);
  });
}

/** Сурагч руу явуулах хэлбэр: зөв утгыг хасна. */
export function toPublicBoxes(boxes: AnswerBox[]): PublicAnswerBox[] {
  return boxes.map((b) => (b.label ? { label: b.label } : {}));
}
