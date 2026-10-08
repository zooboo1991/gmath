import { parseScheduleString } from "./lessonSchedule";

/**
 * Which weekdays a child attends a class on — client-safe, so the admin roster,
 * the register, the family's course page and the reminder cron all read a
 * lesson the same way.
 *
 * Stored on the registration (registrations.attend_days) as dated entries, so
 * changing a child's days never rewrites registers already taken:
 * [{ from: null, days: [2, 4, 5] }, { from: "2026-10-08", days: [2, 4] }].
 * The entry in force on a date is the last one whose `from` is on or before it
 * (null = since the start). `days` are getDay() numbers, 0 = Ням … 6 = Бямба;
 * null days, or no entries, mean every day the class meets.
 */

export type AttendDaysEntry = { from: string | null; days: number[] | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Monday-first, as the school writes a week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_NAMES = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
export const WEEKDAY_SHORT = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];

/** getDay() of an ISO date, as a calendar day (no timezone shift), or null. */
export function weekdayOf(isoDate: string): number | null {
  if (!ISO_DATE.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // 2026-02-31 would roll over into March: not a day at all.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) return null;
  return date.getUTCDay();
}

/** A clean, Monday-first list of distinct weekday numbers, or null when it is not one. */
export function cleanDays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const days = new Set<number>();
  for (const v of raw) {
    if (!Number.isInteger(v) || v < 0 || v > 6) return null;
    days.add(v);
  }
  return WEEK_ORDER.filter((d) => days.has(d));
}

/** The stored jsonb, read defensively: bad entries are dropped, the rest sorted by date. */
export function readAttendDays(raw: unknown): AttendDaysEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AttendDaysEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { from, days } = e as { from?: unknown; days?: unknown };
    if (from !== null && !(typeof from === "string" && ISO_DATE.test(from))) continue;
    const clean = days === null ? null : cleanDays(days);
    if (days !== null && (!clean || clean.length === 0)) continue;
    out.push({ from: from as string | null, days: clean });
  }
  return out.sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
}

/** The days in force on a date (null = every day). An undated lesson uses the current setting. */
export function daysOn(entries: AttendDaysEntry[] | undefined, isoDate: string): number[] | null {
  let current: number[] | null = null;
  for (const e of entries ?? []) {
    if (e.from === null || !isoDate || e.from <= isoDate) current = e.days;
  }
  return current;
}

/** Whether the child is expected at a lesson on this date. A date we cannot read counts as expected. */
export function attendsOn(entries: AttendDaysEntry[] | undefined, isoDate: string): boolean {
  const days = daysOn(entries, isoDate);
  const weekday = weekdayOf(isoDate);
  return days === null || weekday === null || days.includes(weekday);
}

/** Same, for a lesson's display schedule ("2026.10.09 Баасан гараг · 16:00–18:00"). */
export function attendsLesson(entries: AttendDaysEntry[] | undefined, schedule: string | undefined): boolean {
  return attendsOn(entries, parseScheduleString(schedule ?? "").date);
}

/**
 * The entries after a change taking effect on `from` (null = since the start,
 * which replaces the whole history). Days equal to every class day are stored
 * as null, so a child set back to all days follows the class if it changes.
 */
export function changeAttendDays(
  entries: AttendDaysEntry[] | undefined,
  days: number[] | null,
  from: string | null,
  classDays: number[]
): AttendDaysEntry[] {
  const all = days === null || (classDays.length > 0 && classDays.every((d) => days.includes(d)));
  const next: AttendDaysEntry = { from, days: all ? null : WEEK_ORDER.filter((d) => days.includes(d)) };
  if (from === null) return next.days === null ? [] : [next];
  const kept = (entries ?? []).filter((e) => e.from === null || e.from < from);
  // Nothing to record when the days in force before `from` are already these.
  const before = daysOn(kept, from);
  if (JSON.stringify(before) === JSON.stringify(next.days)) return kept;
  return [...kept, next];
}

/**
 * The weekdays a class regularly meets, from its dated lessons, Monday first.
 * A weekday with a single lesson (a make-up Бямба, a holiday swap) is not one
 * of them, so it never becomes a day to pick — unless no weekday recurs at all.
 */
export function classWeekdays(lessons: { schedule?: string }[] | undefined): number[] {
  const seen = new Map<number, number>();
  for (const l of lessons ?? []) {
    const day = weekdayOf(parseScheduleString(l.schedule ?? "").date);
    if (day !== null) seen.set(day, (seen.get(day) ?? 0) + 1);
  }
  const regular = WEEK_ORDER.filter((d) => (seen.get(d) ?? 0) >= 2);
  return regular.length > 0 ? regular : WEEK_ORDER.filter((d) => seen.has(d));
}

/** "2026.10.12" — how the date a change takes effect is written next to the days. */
export const dotDate = (iso: string) => iso.replaceAll("-", ".");

/** "Мягмар, Пүрэв" — for the family's course page and the admin roster. */
export function describeDays(days: number[], short = false): string {
  const names = short ? WEEKDAY_SHORT : WEEKDAY_NAMES;
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => names[d]).join(", ");
}
