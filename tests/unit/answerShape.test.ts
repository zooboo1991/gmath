import { describe, expect, it } from "vitest";
import {
  boxesAreComplete,
  isBoxedAnswerCorrect,
  renderBoxedAnswer,
  toPublicBoxes,
  ANSWER_TYPE_SPECS,
  ANSWER_TYPES,
} from "@/lib/assessment/answerShape";

/**
 * Нүдэн хариултын дүрмүүд. Гол амлалт: сурагч цифр нөхөхөд хэлбэрийн
 * эргэлзээ үлдэхгүй, зөв утга нь клиент рүү хэзээ ч гарахгүй.
 */

describe("нүдний тоо ба бүрэн бүтэн байдал", () => {
  it("төрөл бүр нүдний тоогоо мэднэ", () => {
    expect(ANSWER_TYPE_SPECS.fraction.boxes).toBe(2);
    expect(ANSWER_TYPE_SPECS.mixed.boxes).toBe(3);
    expect(ANSWER_TYPE_SPECS.list.boxes).toBeNull();
  });

  it("дутуу нүдтэй хариултыг бүрэн гэж үзэхгүй", () => {
    expect(boxesAreComplete("mixed", [{ value: "3" }, { value: "1" }])).toBe(false);
    expect(boxesAreComplete("mixed", [{ value: "3" }, { value: "1" }, { value: "2" }])).toBe(true);
    expect(boxesAreComplete("fraction", [{ value: "7" }, { value: " " }])).toBe(false);
    expect(boxesAreComplete("list", [{ value: "1" }])).toBe(false);
    expect(boxesAreComplete("list", [{ value: "1" }, { value: "4" }])).toBe(true);
  });
});

describe("уншигдах хэлбэрт хөрвүүлэх", () => {
  it("төрөл бүрийн бичлэг", () => {
    expect(renderBoxedAnswer("fraction", ["7", "2"])).toBe("7/2");
    expect(renderBoxedAnswer("mixed", ["3", "1", "2"])).toBe("3 1/2");
    expect(renderBoxedAnswer("radical", ["2", "3"])).toBe("2√3");
    expect(renderBoxedAnswer("list", ["1", "4", "7"])).toBe("1; 4; 7");
    expect(renderBoxedAnswer("integer", ["-4"])).toBe("-4");
  });
});

describe("нүдэн хариултыг шалгах", () => {
  const mixed = [{ value: "3" }, { value: "1" }, { value: "2" }];

  it("нүд бүр таарвал зөв", () => {
    expect(isBoxedAnswerCorrect(mixed, ["3", "1", "2"])).toBe(true);
    // Тэргүүн тэг ба зайг тоон утгаар нь харьцуулна.
    expect(isBoxedAnswerCorrect(mixed, [" 3 ", "01", "2"])).toBe(true);
  });

  it("нэг ч нүд зөрвөл буруу", () => {
    expect(isBoxedAnswerCorrect(mixed, ["3", "1", "3"])).toBe(false);
    expect(isBoxedAnswerCorrect(mixed, ["2", "1", "2"])).toBe(false);
  });

  it("хоосон нүдтэй бол буруу", () => {
    expect(isBoxedAnswerCorrect(mixed, ["3", "", "2"])).toBe(false);
    expect(isBoxedAnswerCorrect(mixed, ["3", "  ", "2"])).toBe(false);
  });

  it("нүдний тоо зөрвөл буруу", () => {
    expect(isBoxedAnswerCorrect(mixed, ["3", "1"])).toBe(false);
    expect(isBoxedAnswerCorrect(mixed, ["3", "1", "2", "5"])).toBe(false);
    expect(isBoxedAnswerCorrect([], [])).toBe(false);
  });

  it("хэлбэрийг нүд тогтоодог тул богиносгоогүй бутархай таарахгүй", () => {
    // 7/2 гэсэн түлхүүрт 14/4 нь тоогоор тэнцүү ч нүдээр өөр — сурагчид
    // "хамгийн энгийн хэлбэрт шилжүүл" гэдгийг зааварт хэлнэ.
    const fraction = [{ value: "7" }, { value: "2" }];
    expect(isBoxedAnswerCorrect(fraction, ["7", "2"])).toBe(true);
    expect(isBoxedAnswerCorrect(fraction, ["14", "4"])).toBe(false);
  });

  it("сөрөг тоог тэмдгээр нь ялгана", () => {
    const negative = [{ value: "-4" }];
    expect(isBoxedAnswerCorrect(negative, ["-4"])).toBe(true);
    expect(isBoxedAnswerCorrect(negative, ["−4"])).toBe(true);
    expect(isBoxedAnswerCorrect(negative, ["4"])).toBe(false);
  });
});

describe("нууцлал", () => {
  it("публик хэлбэрт зөв утга үлдэхгүй", () => {
    const boxes = [{ value: "36", label: "x" }, { value: "48", label: "y" }];
    const publicBoxes = toPublicBoxes(boxes);
    expect(JSON.stringify(publicBoxes)).not.toContain("36");
    expect(JSON.stringify(publicBoxes)).not.toContain("48");
    expect(publicBoxes).toEqual([{ label: "x" }, { label: "y" }]);
  });

  it("нэргүй нүд хоосон объект болно", () => {
    expect(toPublicBoxes([{ value: "7" }, { value: "2" }])).toEqual([{}, {}]);
  });

  it("бүх төрөл заавартай", () => {
    for (const type of ANSWER_TYPES) {
      expect(ANSWER_TYPE_SPECS[type].hint.length, type).toBeGreaterThan(10);
    }
  });
});
