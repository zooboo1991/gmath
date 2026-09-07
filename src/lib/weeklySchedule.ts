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

/**
 * Нэг «Боломжит хуваариуд №N» багц: аль нэг ангийн долоо хоногийн хуваарь.
 *
 * Сонгоны цаг сонголт уулзалтаар шийдэгддэг болсноос хойш анги бүрийн
 * хуваарь нь тухайн ангийнх биш, сонгож болох багцуудын нэг гэж нийтэд
 * харагдана. Дугаар нь ангиудын нэрийн дарааллаар тогтдог тул шинэ анги
 * нэмэгдэхгүй л бол тогтвортой.
 */
export type ScheduleBundle = { number: number; slots: WeeklySlot[] };

export function buildScheduleBundles(
  courses: { title: string; weeklySchedule?: string }[]
): ScheduleBundle[] {
  return [...courses]
    .sort((a, b) => a.title.localeCompare(b.title, "mn"))
    .map((c) => parseWeeklySchedule(c.weeklySchedule))
    .filter((slots) => slots.length > 0)
    .map((slots, i) => ({ number: i + 1, slots }));
}
