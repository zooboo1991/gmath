import { getWeekdayNameMn } from "./courseDate";

// A lesson's `schedule` is still stored as one display-ready string (e.g.
// "2026.08.10 Даваа гараг · 18:00–20:00") — no DB/type change needed. The
// admin form instead presents date + start/end time pickers and builds
// this string automatically, with the weekday computed rather than typed.

export function buildScheduleString(isoDate: string, startTime: string, endTime: string): string {
  if (!isoDate) return "";
  const weekday = getWeekdayNameMn(isoDate);
  const dotDate = isoDate.replaceAll("-", ".");
  const datePart = weekday ? `${dotDate} ${weekday} гараг` : dotDate;
  if (startTime && endTime) return `${datePart} · ${startTime}–${endTime}`;
  if (startTime) return `${datePart} · ${startTime}`;
  return datePart;
}

const SCHEDULE_RE = /^(\d{4})\.(\d{2})\.(\d{2})\s+\S+\s+гараг(?:\s*·\s*(\d{2}:\d{2})(?:[–-](\d{2}:\d{2}))?)?$/;

/** Best-effort parse of a legacy schedule string back into picker values. */
export function parseScheduleString(schedule: string): { date: string; startTime: string; endTime: string } {
  const match = schedule.trim().match(SCHEDULE_RE);
  if (!match) return { date: "", startTime: "", endTime: "" };
  const [, year, month, day, startTime, endTime] = match;
  return { date: `${year}-${month}-${day}`, startTime: startTime ?? "", endTime: endTime ?? "" };
}

type ScheduledLesson = { topic: string; schedule?: string };

export type LessonStatus = {
  /** The lesson happening right now, if any. */
  live: ScheduledLesson | null;
  /** The soonest lesson still to come. */
  next: ScheduledLesson | null;
  /** e.g. "08-р сарын 24, Даваа 18:00" */
  nextLabel: string;
};

/** A lesson counts as "live" from ten minutes before it starts. */
const JOIN_EARLY_MS = 10 * 60 * 1000;
/** How long a lesson is assumed to run when no end time was entered. */
const ASSUMED_LENGTH_MS = 2 * 60 * 60 * 1000;

function toLocalDate(isoDate: string, time: string): Date | null {
  if (!isoDate || !time) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // Built from local parts on purpose: this runs in the student's browser, so
  // it lands in their timezone. Doing it on the server would compare against
  // the host's UTC clock and be eight hours off for everyone in Mongolia.
  const date = new Date(y, m - 1, d, hh, mm);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Works out which lesson is on now and which is up next. `now` is injected so
 * the caller controls the clock (and so this is testable).
 */
export function getLessonStatus(lessons: ScheduledLesson[] | undefined, now: Date): LessonStatus {
  const empty: LessonStatus = { live: null, next: null, nextLabel: "" };
  if (!lessons?.length) return empty;

  const timed = lessons
    .map((lesson) => {
      const { date, startTime, endTime } = parseScheduleString(lesson.schedule ?? "");
      const start = toLocalDate(date, startTime);
      if (!start) return null;
      const end = toLocalDate(date, endTime) ?? new Date(start.getTime() + ASSUMED_LENGTH_MS);
      return { lesson, start, end };
    })
    .filter((x): x is { lesson: ScheduledLesson; start: Date; end: Date } => x !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (timed.length === 0) return empty;

  const ms = now.getTime();
  const live = timed.find((t) => ms >= t.start.getTime() - JOIN_EARLY_MS && ms <= t.end.getTime());
  const next = timed.find((t) => t.start.getTime() > ms);

  return {
    live: live?.lesson ?? null,
    next: next?.lesson ?? null,
    nextLabel: next ? formatLessonStart(next.start) : "",
  };
}

function formatLessonStart(start: Date): string {
  const weekday = WEEKDAY_NAMES_MN[start.getDay()];
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  const hh = String(start.getHours()).padStart(2, "0");
  const mm = String(start.getMinutes()).padStart(2, "0");
  return `${month}-р сарын ${day}, ${weekday} ${hh}:${mm}`;
}

const WEEKDAY_NAMES_MN = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
