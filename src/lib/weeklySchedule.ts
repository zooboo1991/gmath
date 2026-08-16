/**
 * The recurring timetable a class keeps every week.
 *
 * Stored as plain text, one line per day, because the teacher edits three
 * lines a term and typing them is faster than any editor we could build:
 *
 *   Даваа 14:30–16:30
 *   Лхагва 14:30–16:30
 *   Баасан 14:00–16:00
 *
 * The day is the first word, the time is whatever follows. Blank lines and a
 * missing time are tolerated — a half-typed line shows the day rather than
 * breaking the page.
 */

export type WeeklySlot = { day: string; time: string };

export function parseWeeklySchedule(value: string | undefined | null): WeeklySlot[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const gap = line.search(/\s/);
      if (gap === -1) return { day: line, time: "" };
      return { day: line.slice(0, gap), time: line.slice(gap + 1).trim() };
    });
}
