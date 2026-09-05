import { describe, expect, it } from "vitest";
import { answerFormatHint, isAnswerCorrect,
  nextLevelForTopic,
  normalizeAnswer,
  overallLevel,
  topicScore } from "@/lib/assessment/placement";

/**
 * Шаталсан түвшин тогтоолтын цөм дүрмүүд. Хариултын шалгалт нь хүүхдийн
 * бичлэгийн ялгааг мэдлэгийн ялгаа гэж андуурах ёсгүй; шатлах дүрэм нь
 * "2 → зөв бол 3, буруу бол 1" гэсэн тохиролцоог яг дагах ёстой.
 */

describe("хариултын нормчлол", () => {
  it("зай, таслал, кирилл х-г тэгшитгэнэ", () => {
    expect(normalizeAnswer(" 13 / 20 ")).toBe("13/20");
    expect(normalizeAnswer("0,65")).toBe("0.65");
    expect(normalizeAnswer("Х=5")).toBe("x=5");
    expect(normalizeAnswer("−4")).toBe("-4");
  });
});

describe("хариултын шалгалт", () => {
  it("яг таарсан текстийг зөвшөөрнө", () => {
    expect(isAnswerCorrect("24", ["24"])).toBe(true);
    expect(isAnswerCorrect(" 24 ", ["24"])).toBe(true);
    expect(isAnswerCorrect("25", ["24"])).toBe(false);
  });

  it("бутархай ба аравтын хэлбэрийг ижил гэж үзнэ", () => {
    // Эзэн зөвхөн "13/20" гэж оруулсан ч "0.65" гэж бичсэн хүүхэд зөв.
    expect(isAnswerCorrect("0.65", ["13/20"])).toBe(true);
    expect(isAnswerCorrect("13/20", ["0.65"])).toBe(true);
    expect(isAnswerCorrect("0,65", ["13/20"])).toBe(true);
    expect(isAnswerCorrect("0.66", ["13/20"])).toBe(false);
  });

  it("сөрөг тоо, тэгийг зөв харьцуулна", () => {
    expect(isAnswerCorrect("-4", ["-4"])).toBe(true);
    expect(isAnswerCorrect("−4", ["-4"])).toBe(true);
    expect(isAnswerCorrect("0", ["0"])).toBe(true);
    expect(isAnswerCorrect("4", ["-4"])).toBe(false);
  });

  it("тоон бус хариултыг текстээр л харьцуулна", () => {
    expect(isAnswerCorrect("x=5", ["Х = 5"])).toBe(true);
    expect(isAnswerCorrect("тийм", ["Тийм"])).toBe(true);
    expect(isAnswerCorrect("үгүй", ["Тийм"])).toBe(false);
  });

  it("хоосон оролт хэзээ ч зөв биш", () => {
    expect(isAnswerCorrect("", ["0"])).toBe(false);
    expect(isAnswerCorrect("   ", ["24"])).toBe(false);
  });

  it("тэгд хуваасан бутархайд унахгүй", () => {
    expect(isAnswerCorrect("5/0", ["24"])).toBe(false);
  });
});

describe("шатлах дүрэм", () => {
  it("сэдэв бүр 2-оос эхэлнэ", () => {
    expect(nextLevelForTopic({ topicOrder: 1, steps: [] })).toBe(2);
  });

  it("2-т зөв бол 3 руу, буруу бол 1 рүү", () => {
    expect(nextLevelForTopic({ topicOrder: 1, steps: [{ level: 2, isCorrect: true }] })).toBe(3);
    expect(nextLevelForTopic({ topicOrder: 1, steps: [{ level: 2, isCorrect: false }] })).toBe(1);
  });

  it("хоёр дахь хариултаар сэдэв хаагдана", () => {
    expect(
      nextLevelForTopic({
        topicOrder: 1,
        steps: [
          { level: 2, isCorrect: true },
          { level: 3, isCorrect: false },
        ],
      })
    ).toBeNull();
    expect(
      nextLevelForTopic({
        topicOrder: 1,
        steps: [
          { level: 2, isCorrect: false },
          { level: 1, isCorrect: true },
        ],
      })
    ).toBeNull();
  });
});

describe("сэдвийн оноо", () => {
  const t = (steps: { level: number; isCorrect: boolean }[]) => topicScore({ topicOrder: 1, steps });

  it("дөрвөн мөчир дөрвөн өөр оноотой", () => {
    expect(t([{ level: 2, isCorrect: false }, { level: 1, isCorrect: false }])).toBe(0);
    expect(t([{ level: 2, isCorrect: false }, { level: 1, isCorrect: true }])).toBe(1);
    expect(t([{ level: 2, isCorrect: true }, { level: 3, isCorrect: false }])).toBe(2);
    expect(t([{ level: 2, isCorrect: true }, { level: 3, isCorrect: true }])).toBe(3);
  });

  it("хугацаа дууссан хагас сэдэвт хамгийн муу таамаг", () => {
    // Огт эхлээгүй → 0; 2-т зөв хариулаад 3-оо амжаагүй → 2 нь үлдэнэ.
    expect(t([])).toBe(0);
    expect(t([{ level: 2, isCorrect: true }])).toBe(2);
    expect(t([{ level: 2, isCorrect: false }])).toBe(0);
  });
});

describe("ерөнхий түвшин", () => {
  it("дундажаар гурав хуваана", () => {
    expect(overallLevel([0, 1, 1, 0])).toBe(1);
    expect(overallLevel([2, 2, 2, 1])).toBe(2);
    expect(overallLevel([3, 3, 2, 3])).toBe(3);
  });

  it("яг босго дээрх утгууд", () => {
    expect(overallLevel([1.5, 1.5])).toBe(2);
    expect(overallLevel([2.5, 2.5])).toBe(2);
  });

  it("хоосон жагсаалт хамгийн доод түвшин", () => {
    expect(overallLevel([])).toBe(1);
  });
});

describe("бичих заавар (answerFormatHint)", () => {
  it("бүхэл тоо", () => {
    expect(answerFormatHint(["24"])).toContain("бүхэл тоогоор");
    expect(answerFormatHint(["-7"])).toContain("бүхэл тоогоор");
  });

  it("аравтын бутархай", () => {
    expect(answerFormatHint(["0.65"])).toContain("аравтын бутархайгаар");
    expect(answerFormatHint(["0,65"])).toContain("аравтын бутархайгаар");
  });

  it("энгийн бутархай", () => {
    const hint = answerFormatHint(["13/20"]);
    expect(hint).toContain("энгийн бутархайгаар");
    expect(hint).not.toContain("аравтын");
  });

  it("нэг утгын хоёр хэлбэр зэрэг зөвшөөрөгдвөл хоёуланг нь заана", () => {
    const hint = answerFormatHint(["13/20", "0.65"]);
    expect(hint).toContain("энгийн бутархайгаар");
    expect(hint).toContain("аравтын бутархайгаар");
  });

  it("өөр өөр утгууд холилдвол аравтыг амлахгүй — 1/3-ыг 0.33 гэж бичүүлэхгүй", () => {
    // ["1/3", "2"] нь хоёр тусдаа хариулт: 1/3-ын аравтын хэлбэр жагсаалтад
    // байхгүй тул "аравтаар ч болно" гэж хэлбэл 0.33 гэж бичсэн сурагч
    // буруугаар унана. Зөвхөн бутархайн заавар өгөх ёстой.
    const hint = answerFormatHint(["1/3", "2"]);
    expect(hint).toContain("энгийн бутархайгаар");
    expect(hint).not.toContain("аравтын");
  });

  it("тоон бус хариултад ерөнхий заавар", () => {
    expect(answerFormatHint(["x=3"])).toBe("Хариултаа товч бичээрэй.");
    expect(answerFormatHint([])).toBe("Хариултаа товч бичээрэй.");
  });

  it("жишээ тоо нь зөв хариулттай давхцвал өөр жишээг сонгоно", () => {
    // Жишээ нь өөрөө оноо авчихдаг бол заавар биш хариултын түлхүүр болно.
    // Текстээр ("24"), тоогоор ("6/8" = 3/4, "0.750" = 0.75) давхцах хоёр
    // замын аль алиныг нь тойрох ёстой.
    for (const answers of [["24"], ["3/4"], ["0.75"], ["6/8"], ["0.750"], ["13/20"], ["-124"]]) {
      const hint = answerFormatHint(answers);
      const examples = hint.match(/жишээ нь: ([^\s)]+)/gi) ?? [];
      for (const match of examples) {
        const example = match.replace(/жишээ нь: /i, "");
        expect(isAnswerCorrect(example, answers), `${hint} ← ${answers[0]}`).toBe(false);
      }
      expect(examples.length).toBeGreaterThan(0);
    }
  });
});
