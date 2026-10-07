import * as XLSX from "xlsx";
import type { ProblemScore } from "./score";
import type { OlympiadRosterEntry } from "./db";
import { matchName, type NameMatch } from "./names";

/**
 * Reads a graded olympiad workbook: a score sheet (a «Сурагч» column and one
 * column per problem headed "1", "2", …), plus, optionally, a comments sheet
 * («Сурагч», «Бодлого», «Тайлбар») and a teacher-notes sheet («Сурагч»,
 * «Бодлого», «Тэмдэглэл») — the layout of the grading workbook the school
 * already produces. Rows are matched to registered children by name.
 */

export type ImportedRow = {
  name: string;
  scores: ProblemScore[];
  comments: string[];
  notes: string[];
};

export type ParsedWorkbook = {
  rows: ImportedRow[];
  /** Whether the workbook has a comments / notes sheet. Without one, saving keeps the stored texts. */
  hasComments: boolean;
  hasNotes: boolean;
};

export type ImportPreviewRow = ImportedRow & NameMatch;

export class OlympiadImportError extends Error {}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const lower = (v: unknown) => text(v).toLowerCase();

type Sheet = unknown[][];

function sheets(buffer: Uint8Array): Sheet[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    throw new OlympiadImportError("Excel файлыг уншиж чадсангүй.");
  }
  return wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null }));
}

/** First row (within the top few) holding all the given headers, with their column indexes. */
function headerOf(rows: Sheet, wanted: string[]): { index: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const cells = rows[i].map(lower);
    const cols: Record<string, number> = {};
    for (const w of wanted) {
      const at = cells.indexOf(w);
      if (at >= 0) cols[w] = at;
    }
    if (Object.keys(cols).length === wanted.length) return { index: i, cols };
  }
  return null;
}

/** Stat rows the grading workbook puts under the table — whole words, so "Нийтсүрэн" is still a child. */
const NOT_A_CHILD = /^(дундаж|бүтэн|оноо авсан|нийт)(?!\p{L})/iu;

/** "-" or "–" in a score cell means the problem was not attempted, like an empty cell. */
const NOT_ATTEMPTED = /^[-–—]$/;

/** How the comment sheets refer to a score row: case and spacing do not matter. */
const sameName = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

export function parseOlympiadWorkbook(buffer: Uint8Array, problemCount: number): ParsedWorkbook {
  const all = sheets(buffer);
  const scoreSheets = all
    .map((rows) => ({ rows, head: headerOf(rows, ["сурагч", ...Array.from({ length: problemCount }, (_, i) => String(i + 1))]) }))
    .filter((s) => s.head);
  const scoreSheet = scoreSheets[0];
  if (!scoreSheet?.head) {
    throw new OlympiadImportError(
      `Онооны хүснэгт олдсонгүй — «Сурагч» болон 1…${problemCount} гэсэн баганатай хуудас оруулна уу.`
    );
  }
  // Two classes or two months in one file: which sheet's comments belong to which row is a guess.
  if (scoreSheets.length > 1) {
    throw new OlympiadImportError("Файлд онооны хүснэгттэй хуудас нэгээс олон байна — нэг олимпиадын хуудсыг л үлдээнэ үү.");
  }
  const { rows, head } = scoreSheet;
  // A column "11" on a 10-problem olympiad, or a second "3", would be dropped and the totals be wrong.
  const numbered = rows[head.index].map(lower).filter((c) => /^\d+$/.test(c));
  const extra = numbered.filter((c) => Number(c) > problemCount);
  if (extra.length > 0) {
    throw new OlympiadImportError(
      `Файлд ${Math.max(...extra.map(Number))} бодлогын багана байна, олимпиад ${problemCount} бодлоготой. Бодлогын тоог шалгана уу.`
    );
  }
  const twice = numbered.find((c, i) => numbered.indexOf(c) !== i);
  if (twice) throw new OlympiadImportError(`${twice}-р бодлогын багана хоёр удаа байна.`);
  const out: ImportedRow[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(head.index + 1)) {
    const name = text(row[head.cols["сурагч"]]);
    if (!name || NOT_A_CHILD.test(name)) continue;
    const scores: ProblemScore[] = [];
    for (let n = 1; n <= problemCount; n++) {
      const raw = row[head.cols[String(n)]];
      const cell = text(raw);
      if (cell === "" || NOT_ATTEMPTED.test(cell)) {
        scores.push(null);
        continue;
      }
      // Never guess: "x" or 6.5 is a typo for the admin to fix, not a score to round.
      const v = typeof raw === "number" ? raw : Number(cell.replace(",", "."));
      if (!Number.isInteger(v)) {
        throw new OlympiadImportError(`${name}: ${n}-р бодлогын оноо «${cell}» — бүхэл тоо байх ёстой.`);
      }
      scores.push(v);
    }
    if (scores.every((s) => s === null)) continue;
    // Comments are matched to rows by name, so two rows with one name would share them.
    if (seen.has(sameName(name))) {
      throw new OlympiadImportError(`«${name}» гэсэн нэр хоёр мөрөнд байна — овгоор нь ялгаж бичнэ үү.`);
    }
    seen.add(sameName(name));
    out.push({ name, scores, comments: Array(problemCount).fill(""), notes: Array(problemCount).fill("") });
  }

  // Per-problem texts from the comment / notes sheets, keyed by name and problem.
  const comments = all.filter((r) => headerOf(r, ["сурагч", "бодлого", "тайлбар"]));
  const notes = all.filter((r) => headerOf(r, ["сурагч", "бодлого", "тэмдэглэл"]));
  if (comments.length > 1) throw new OlympiadImportError("«Тайлбар» хуудас нэгээс олон байна — нэгийг л үлдээнэ үү.");
  if (notes.length > 1) throw new OlympiadImportError("«Тэмдэглэл» хуудас нэгээс олон байна — нэгийг л үлдээнэ үү.");
  // Family comments and teacher-only notes on one sheet would be one wrong header away from a leak.
  if (comments[0] && comments[0] === notes[0]) {
    throw new OlympiadImportError("Нэг хуудсанд «Тайлбар», «Тэмдэглэл» хоёулаа байна — гэр бүлд харагдах тайлбар, багшийн тэмдэглэлийг тусад нь хуудас болгоно уу.");
  }
  const byName = new Map(out.map((o) => [sameName(o.name), o]));
  const fill = (sheet: Sheet | undefined, column: "тайлбар" | "тэмдэглэл", into: "comments" | "notes") => {
    const h = sheet && headerOf(sheet, ["сурагч", "бодлого", column]);
    if (!sheet || !h) return;
    for (const r of sheet.slice(h.index + 1)) {
      const name = text(r[h.cols["сурагч"]]);
      const value = text(r[h.cols[column]]);
      if (!value) continue;
      // A text that fits no score row would be dropped while the sheet still replaces what is stored.
      const target = byName.get(sameName(name));
      if (!target) throw new OlympiadImportError(`«${column === "тайлбар" ? "Тайлбар" : "Тэмдэглэл"}» хуудасны «${name}» гэсэн нэр онооны хуудсанд алга — нэрийг ижил бичнэ үү.`);
      const n = Number(text(r[h.cols["бодлого"]]));
      if (!Number.isInteger(n) || n < 1 || n > problemCount) {
        throw new OlympiadImportError(`«${name}»-ийн тайлбарт бодлогын дугаар «${text(r[h.cols["бодлого"]])}» буруу — 1…${problemCount} байна.`);
      }
      target[into][n - 1] = value;
    }
  };
  fill(comments[0], "тайлбар", "comments");
  fill(notes[0], "тэмдэглэл", "notes");
  return { rows: out, hasComments: comments.length > 0, hasNotes: notes.length > 0 };
}

/** Each row with the registered child its name points at (see matchName). */
export function matchNames(rows: ImportedRow[], roster: OlympiadRosterEntry[]): ImportPreviewRow[] {
  return rows.map((row) => ({ ...row, ...matchName(row.name, roster) }));
}
