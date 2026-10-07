/**
 * Мини олимпиад — оноо, байр, Excel унших, нэр тааруулах (pure, no server).
 */

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { isOlympiadDate, normalizeScores, normalizeTexts, placeOf, standings, totalOf } from "@/lib/miniOlympiad/score";
import { matchName } from "@/lib/miniOlympiad/names";
import { matchNames, OlympiadImportError, parseOlympiadWorkbook } from "@/lib/miniOlympiad/import";

describe("totals and places", () => {
  it("adds points, counting a skipped problem as nothing", () => {
    expect(totalOf([7, null, 3, 0])).toBe(10);
  });

  it("shares a place on a tie and skips the next one", () => {
    const totals = [33, 23, 13, 13, 12];
    expect(totals.map((t) => placeOf(totals, t))).toEqual([1, 2, 3, 3, 5]);
  });

  it("places the owner's test account without counting it against real children", () => {
    const placed = standings([
      { userId: "a", total: 20, isTest: false },
      { userId: "test", total: 30, isTest: true },
      { userId: "b", total: 10, isTest: false },
    ]);
    expect(placed.get("a")).toEqual({ place: 1, participants: 2 });
    expect(placed.get("b")).toEqual({ place: 2, participants: 2 });
    expect(placed.get("test")).toEqual({ place: 1, participants: 3 });
  });
});

describe("input checks", () => {
  it("accepts whole points within range and empty cells as not attempted", () => {
    expect(normalizeScores([7, "", null, "3"], 4, 7)).toEqual([7, null, null, 3]);
  });

  it("refuses the wrong count, fractions and points above the maximum", () => {
    expect(normalizeScores([1, 2], 3, 7)).toBeNull();
    expect(normalizeScores([1.5, 2, 3], 3, 7)).toBeNull();
    expect(normalizeScores([8, 2, 3], 3, 7)).toBeNull();
    expect(normalizeScores([-1, 2, 3], 3, 7)).toBeNull();
  });

  it("fills missing texts and caps long ones", () => {
    expect(normalizeTexts(undefined, 2)).toEqual(["", ""]);
    expect(normalizeTexts(["  сайн  ", 5], 2)).toEqual(["сайн", ""]);
    expect(normalizeTexts(["x".repeat(5000), ""], 2)?.[0]).toHaveLength(1000);
    expect(normalizeTexts(["a"], 2)).toBeNull();
  });

  it("takes only real calendar days", () => {
    expect(isOlympiadDate("2026-10-04")).toBe(true);
    expect(isOlympiadDate("2026-02-31")).toBe(false);
    expect(isOlympiadDate("2026-10-4")).toBe(false);
    expect(isOlympiadDate(undefined)).toBe(false);
  });
});

const roster = [
  { userId: "zam", name: "Нацагдорж Заманди", phone: "1" },
  { userId: "enh", name: "Bumtsend Enkhzul", phone: "2" },
  { userId: "bt", name: "Баянмөнх Төгөлдөр", phone: "3" },
  { userId: "bol", name: "Болор Төгөлдөр", phone: "4" },
  { userId: "his", name: "Э Хишиг", phone: "5" },
];

describe("matching a written name to a registered child", () => {
  it("picks a child when first name and surname both agree, in either script", () => {
    expect(matchName("Нацагдорж Заманди", roster).userId).toBe("zam");
    expect(matchName("Bumtsend Enkhzul (Энхзул)", roster).userId).toBe("enh");
    expect(matchName("Баянмөнх Төгөлдөр", roster).userId).toBe("bt");
  });

  it("only suggests a child matched on the first name alone, or with just an initial", () => {
    // "D" is the programme letter on these scans, not the surname.
    expect(matchName("D Zamandi", roster)).toMatchObject({ userId: null, suggestion: "zam" });
    expect(matchName("Hishig", roster)).toMatchObject({ userId: null, suggestion: "his" });
    expect(matchName("Н.Заманди", roster)).toMatchObject({ userId: null, suggestion: "zam" });
    // Registered with an initial only: one letter is all there is to go on.
    expect(matchName("Э Хишиг", roster)).toMatchObject({ userId: null, suggestion: "his" });
  });

  it("never picks between namesakes on a single letter, and lists them all", () => {
    const anungoo = [
      { userId: "d", name: "Д Анунгоо", phone: "1" },
      { userId: "bat", name: "Бат Анунгоо", phone: "2" },
    ];
    for (const written of ["D Anungoo", "D B Anungoo", "Д.Анунгоо"]) {
      const m = matchName(written, anungoo);
      expect(m).toMatchObject({ userId: null, suggestion: null });
      expect(m.candidates.sort()).toEqual(["bat", "d"]);
    }
    const hishig = [
      { userId: "e", name: "Э Хишиг", phone: "1" },
      { userId: "enh", name: "Энхбаяр Хишиг", phone: "2" },
    ];
    expect(matchName("Э Хишиг", hishig)).toMatchObject({ userId: null, suggestion: null });
  });

  it("only suggests a name written in the other order", () => {
    // "Бат Болд" is Бат's child Болд; the registered "Болд Бат" is Болд's child Бат.
    expect(matchName("Бат Болд", [{ userId: "x", name: "Болд Бат", phone: "1" }])).toMatchObject({ userId: null, suggestion: "x" });
  });

  it("never lets a programme letter that looks like an initial pick one of two namesakes", () => {
    const kids = [
      { userId: "dorj", name: "Дорж Анунгоо", phone: "1" },
      { userId: "bat", name: "Бат Анунгоо", phone: "2" },
    ];
    const m = matchName("D Anungoo", kids);
    expect(m).toMatchObject({ userId: null, suggestion: null });
    expect(m.candidates.sort()).toEqual(["bat", "dorj"]);
  });

  it("leaves a first name two children share for the admin to choose", () => {
    const m = matchName("Tuguldur", roster);
    expect(m).toMatchObject({ userId: null, suggestion: null });
    expect(m.candidates.sort()).toEqual(["bol", "bt"]);
  });

  it("never matches a namesake whose surname contradicts the written one", () => {
    const kids = [
      { userId: "a", name: "Болд Тэмүүлэн", phone: "1" },
      { userId: "b", name: "Ганбат Тэмүүжин", phone: "2" },
      { userId: "c", name: "Б Бат", phone: "3" },
    ];
    expect(matchName("Дорж Тэмүүлэн", kids)).toEqual({ userId: null, suggestion: null, candidates: [] });
    // A patronymic that is another child's first name.
    expect(matchName("Тэмүүжин Эрхэс", kids)).toEqual({ userId: null, suggestion: null, candidates: [] });
    expect(matchName("Дорж Бат", kids).userId).toBeNull();
    expect(matchName("Болд Бат", kids)).toMatchObject({ userId: null, suggestion: "c" });
  });

  it("keeps a hyphenated first name whole", () => {
    const kids = [{ userId: "be", name: "Ганболд Бат-Эрдэнэ", phone: "1" }];
    expect(matchName("Ganbold Bat-Erdene", kids).userId).toBe("be");
    expect(matchName("Дорж Мөнх-Эрдэнэ", kids)).toEqual({ userId: null, suggestion: null, candidates: [] });
    expect(matchName("Мөнх-Эрдэнэ", kids).candidates).toEqual([]);
  });
});

const SCORES: unknown[][] = [
  ["№", "Сурагч", "1", "2", "3", "Нийт (21)"],
  [1, "Нацагдорж Заманди", 7, 3, 0, 10],
  [2, "Tuguldur", 3, "", 1, 4],
  [],
  ["", "Дундаж оноо", 5, 1.5, 0.5, 7],
];

const write = (wb: XLSX.WorkBook) => new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);

function scoresOnly(scores: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scores), "Дүн");
  return write(wb);
}

/** The layout of the grading workbook: «Дүн», «Тайлбар», «Багшид». */
function gradingWorkbook(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(SCORES), "Дүн");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Сурагч", "Бодлого", "Оноо", "Хүүхдийн хариу", "Тайлбар"],
      ["Нацагдорж Заманди", 1, 7, "6", "Зөв, сайн тайлбарласан."],
      ["нацагдорж  заманди", 2, 3, "120", "Жишээ дутуу."],
    ]),
    "Тайлбар"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Сурагч", "Бодлого", "Оноо", "Засагч А", "Засагч Б", "Тэмдэглэл"],
      ["Tuguldur", 3, 1, "", "", "1 эсвэл 3 — багш шийднэ"],
    ]),
    "Багшид"
  );
  return write(wb);
}

describe("reading the grading workbook", () => {
  it("takes scores, comments and teacher notes, and skips the summary rows", () => {
    const { rows, hasComments, hasNotes } = parseOlympiadWorkbook(gradingWorkbook(), 3);
    expect(rows.map((r) => r.name)).toEqual(["Нацагдорж Заманди", "Tuguldur"]);
    expect(rows[0]).toMatchObject({ scores: [7, 3, 0], comments: ["Зөв, сайн тайлбарласан.", "Жишээ дутуу.", ""] });
    expect(rows[1]).toMatchObject({ scores: [3, null, 1], notes: ["", "", "1 эсвэл 3 — багш шийднэ"] });
    expect({ hasComments, hasNotes }).toEqual({ hasComments: true, hasNotes: true });
  });

  it("says when there is no comments or notes sheet, so saving keeps the stored ones", () => {
    expect(parseOlympiadWorkbook(scoresOnly(SCORES), 3)).toMatchObject({ hasComments: false, hasNotes: false });
  });

  it("matches the rows to registered children", () => {
    const [zam, tug] = matchNames(parseOlympiadWorkbook(gradingWorkbook(), 3).rows, roster);
    expect(zam.userId).toBe("zam");
    expect(tug.userId).toBeNull();
  });

  it("refuses a workbook without a score sheet for that many problems", () => {
    expect(() => parseOlympiadWorkbook(gradingWorkbook(), 10)).toThrow(OlympiadImportError);
  });

  it("refuses a workbook with more problems than the olympiad, instead of dropping columns", () => {
    const five = [["Сурагч", "1", "2", "3", "4", "5"], ["Бат Ану", 0, 0, 0, 7, 7]];
    expect(() => parseOlympiadWorkbook(scoresOnly(five), 3)).toThrow(/5 бодлогын багана/);
  });

  it("refuses a problem column twice, and a score that is not a whole number", () => {
    expect(() => parseOlympiadWorkbook(scoresOnly([["Сурагч", "1", "2", "3", "3"], ["Бат Ану", 1, 1, 1, 7]]), 3)).toThrow(/хоёр удаа/);
    expect(() => parseOlympiadWorkbook(scoresOnly([["Сурагч", "1", "2", "3"], ["Бат Ану", 1, "x", 1]]), 3)).toThrow(/бүхэл тоо/);
    expect(() => parseOlympiadWorkbook(scoresOnly([["Сурагч", "1", "2", "3"], ["Бат Ану", 1, 6.5, 1]]), 3)).toThrow(/бүхэл тоо/);
    expect(parseOlympiadWorkbook(scoresOnly([["Сурагч", "1", "2", "3"], ["Бат Ану", 1, "-", ""]]), 3).rows[0].scores).toEqual([1, null, null]);
  });

  it("skips summary rows but not a child whose name starts like one", () => {
    const rows = [["Сурагч", "1", "2", "3"], ["Нийтсүрэн Бат", 1, 1, 1], ["Нийт", 1, 1, 1], ["Дундаж оноо", 1, 1, 1]];
    expect(parseOlympiadWorkbook(scoresOnly(rows), 3).rows.map((r) => r.name)).toEqual(["Нийтсүрэн Бат"]);
  });

  it("refuses a file whose comments could land on the wrong child", () => {
    type Sheet = [string, unknown[][]];
    const score: Sheet = ["Дүн", [["Сурагч", "1", "2", "3"], ["Бат Ану", 1, 1, 1]]];
    const book = (sheets: Sheet[]) => {
      const wb = XLSX.utils.book_new();
      for (const [n, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
      return write(wb);
    };
    const comments = (rows: unknown[][]): Sheet => ["Тайлбар", [["Сурагч", "Бодлого", "Тайлбар"], ...rows]];
    // Two classes or months in one file.
    expect(() => parseOlympiadWorkbook(book([score, ["C дүн", score[1]]]), 3)).toThrow(/нэгээс олон/);
    expect(() => parseOlympiadWorkbook(book([score, comments([["Бат Ану", 1, "a"]]), ["Тайлбар 2", comments([])[1]]]), 3)).toThrow(/нэгээс олон/);
    // Family comments and teacher notes on one sheet.
    expect(() =>
      parseOlympiadWorkbook(book([score, ["Холимог", [["Сурагч", "Бодлого", "Тайлбар", "Тэмдэглэл"], ["Бат Ану", 1, "a", "b"]]]]), 3)
    ).toThrow(/тусад нь/);
    // A comment that fits no score row, or no problem.
    expect(() => parseOlympiadWorkbook(book([score, comments([["Б.Ану", 1, "a"]])]), 3)).toThrow(/онооны хуудсанд алга/);
    expect(() => parseOlympiadWorkbook(book([score, comments([["Бат Ану", "2-р", "a"]])]), 3)).toThrow(/бодлогын дугаар/);
    // Empty rows are fine.
    expect(parseOlympiadWorkbook(book([score, comments([["Хэн нэгэн", 1, ""], [], ["Бат Ану", 2, "сайн"]])]), 3).rows[0].comments).toEqual(["", "сайн", ""]);
  });

  it("refuses two rows with one name, whose comments could not be told apart", () => {
    const twice = [["Сурагч", "1", "2", "3"], ["Tuguldur", 7, 0, 0], ["tuguldur ", 0, 5, 0]];
    expect(() => parseOlympiadWorkbook(scoresOnly(twice), 3)).toThrow(/хоёр мөрөнд/);
  });
});
