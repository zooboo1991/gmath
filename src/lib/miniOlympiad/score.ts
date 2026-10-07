/**
 * Мини олимпиадын оноо: нийлбэр, байр, оруулсан утгын шалгалт. Client-safe —
 * the admin screen and the family's tab compute the same way the server does.
 */

/** Points for one problem; null means the child did not attempt it. */
export type ProblemScore = number | null;

export function totalOf(scores: ProblemScore[]): number {
  return scores.reduce<number>((sum, s) => sum + (s ?? 0), 0);
}

/**
 * Competition ranking: 1 + how many scored strictly more. Equal totals share a
 * place and the next place is skipped (1, 2, 3, 3, 5).
 */
export function placeOf(allTotals: number[], mine: number): number {
  return 1 + allTotals.filter((t) => t > mine).length;
}

export type Standing = { place: number; participants: number };

/**
 * Each child's place and how many took part. Test accounts (the owner trying
 * the flow) are placed against the real children but never counted among
 * them, so a real family's "3-р байр / 23 хүүхдээс" is the same with or
 * without a test row.
 */
export function standings(entries: { userId: string; total: number; isTest: boolean }[]): Map<string, Standing> {
  const real = entries.filter((e) => !e.isTest).map((e) => e.total);
  return new Map(
    entries.map((e) => {
      const field = e.isTest ? [...real, e.total] : real;
      return [e.userId, { place: placeOf(field, e.total), participants: field.length }];
    })
  );
}

export const MAX_COMMENT = 1000;

/** "2026-10-04" that is a real day (not 2026-02-31). */
export function isOlympiadDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Per-problem points from untrusted input: exactly `count` entries, each a
 * whole number 0..max or null. Returns null when the input is not that.
 */
export function normalizeScores(raw: unknown, count: number, max: number): ProblemScore[] | null {
  if (!Array.isArray(raw) || raw.length !== count) return null;
  const out: ProblemScore[] = [];
  for (const v of raw) {
    if (v === null || v === "" || v === undefined) {
      out.push(null);
      continue;
    }
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(n) || n < 0 || n > max) return null;
    out.push(n);
  }
  return out;
}

/** Per-problem texts from untrusted input: `count` strings, trimmed and capped. */
export function normalizeTexts(raw: unknown, count: number): string[] | null {
  if (raw === undefined) return Array.from({ length: count }, () => "");
  if (!Array.isArray(raw) || raw.length !== count) return null;
  return raw.map((v) => (typeof v === "string" ? v.trim().slice(0, MAX_COMMENT) : ""));
}
