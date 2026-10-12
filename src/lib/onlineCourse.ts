import { parseScheduleString } from "./lessonSchedule";
import { weekdayOf, WEEKDAY_NAMES } from "./attendDays";

/**
 * Reading an online olympiad course (template "online-olympiad") off its own
 * row, so the teacher keeps editing the usual fields and the page follows:
 *
 * - lessons are the video and Zoom lessons, the kind written at the end of the
 *   topic — "Гурвалжин 1 (видео)", "Гурвалжин 3 (Zoom)";
 * - the weekly rhythm is the course's «7 хоногийн хуваарь», one day per line,
 *   time and what happens split by " · " — "Мягмар 09:00–21:00 · Даалгавар 1: …".
 *
 * Client-safe: no database import.
 */

export type OnlineLessonKind = "video" | "zoom" | "other";

const KIND_SUFFIX = /\s*\((видео|zoom)\)\s*$/i;

export function lessonKind(topic: string): OnlineLessonKind {
  const m = topic.match(KIND_SUFFIX);
  if (!m) return "other";
  return m[1].toLowerCase() === "zoom" ? "zoom" : "video";
}

/** The topic without its kind: "Гурвалжин 1 (видео)" → "Гурвалжин 1". */
export function lessonTitle(topic: string): string {
  return topic.replace(KIND_SUFFIX, "").trim();
}

/** The subject a lesson belongs to: "Гурвалжин 1 (видео)" → "Гурвалжин". */
export function lessonSubject(topic: string): string {
  return lessonTitle(topic).replace(/\s+\d+$/, "").trim();
}

export type OnlineLesson = {
  kind: OnlineLessonKind;
  title: string;
  date: string;
  weekday: string;
  time: string;
};

export type CourseWeek = {
  number: number;
  /** Monday and Sunday of the week, ISO dates. */
  start: string;
  end: string;
  /** The subjects taught that week, in lesson order. */
  subjects: string[];
  lessons: OnlineLesson[];
};

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** The dated lessons grouped into Monday–Sunday weeks, numbered from the first. */
export function courseWeeks(lessons: { topic: string; schedule?: string }[]): CourseWeek[] {
  const byWeek = new Map<string, CourseWeek>();
  const dated = lessons
    .map((l) => ({ l, parsed: parseScheduleString(l.schedule ?? "") }))
    .filter(({ parsed }) => parsed.date)
    .sort((a, b) => (a.parsed.date + a.parsed.startTime).localeCompare(b.parsed.date + b.parsed.startTime));
  for (const { l, parsed } of dated) {
    const day = weekdayOf(parsed.date)!;
    const monday = addDays(parsed.date, -((day + 6) % 7));
    let week = byWeek.get(monday);
    if (!week) {
      week = { number: byWeek.size + 1, start: monday, end: addDays(monday, 6), subjects: [], lessons: [] };
      byWeek.set(monday, week);
    }
    const subject = lessonSubject(l.topic);
    if (!week.subjects.includes(subject)) week.subjects.push(subject);
    week.lessons.push({
      kind: lessonKind(l.topic),
      title: lessonTitle(l.topic),
      date: parsed.date,
      weekday: WEEKDAY_NAMES[day],
      time: parsed.startTime && parsed.endTime ? `${parsed.startTime}–${parsed.endTime}` : parsed.startTime,
    });
  }
  return [...byWeek.values()];
}

export type RhythmDay = { day: string; time: string; text: string };

/** «7 хоногийн хуваарь» lines as day / time / what happens. */
export function weeklyRhythm(value: string | undefined | null): RhythmDay[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const gap = line.search(/\s/);
      const day = gap === -1 ? line : line.slice(0, gap);
      const rest = gap === -1 ? "" : line.slice(gap + 1).trim();
      const [time, ...text] = rest.split(" · ");
      return { day, time: text.length ? time.trim() : "", text: text.length ? text.join(" · ").trim() : time.trim() };
    });
}

/** What the course adds up to: lessons from the lesson list, tasks and tests from the weekly rhythm. */
export function courseTotals(lessons: { topic: string; schedule?: string }[], rhythm: RhythmDay[]) {
  const weeks = courseWeeks(lessons).length;
  const perWeek = (word: RegExp) => rhythm.filter((r) => word.test(r.text)).length;
  return {
    weeks,
    videos: lessons.filter((l) => lessonKind(l.topic) === "video").length,
    zooms: lessons.filter((l) => lessonKind(l.topic) === "zoom").length,
    tasks: perWeek(/^даалгавар/i) * weeks,
    tests: perWeek(/^сорил/i) * weeks,
  };
}

/** "10.19–10.25" */
export const shortRange = (start: string, end: string) => `${start.slice(5).replace("-", ".")}–${end.slice(5).replace("-", ".")}`;
