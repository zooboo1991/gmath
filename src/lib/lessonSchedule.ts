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

/**
 * Converts a "date + time" pair that's implicitly Mongolia local time (no
 * offset stored — see the comment on toLocalDate() below) into a real UTC
 * instant, safe to call from server code. toLocalDate() below deliberately
 * does NOT do this — it runs in the student's own browser, so building a
 * Date from local parts there already lands in the right timezone; doing
 * the same server-side would be off by Mongolia's UTC+8 (no DST, so a fixed
 * offset is always correct). Used by the lesson-reminder cron.
 */
export function mongoliaLocalToUtc(isoDate: string, time: string): Date | null {
  if (!isoDate || !time) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, hh - 8, mm));
  return Number.isNaN(date.getTime()) ? null : date;
}

// A structural subset of `Lesson` (lib/db.ts) so this module stays free of the
// server-only database import. Anything the profile reads off a lesson has to
// be named here too, or it is invisible to the components below.
type ScheduledLesson = {
  topic: string;
  schedule?: string;
  zoomLink?: string;
  recordingLink?: string;
  noteFile?: string;
  noteSize?: number;
};

/**
 * `live` opens the room a quarter of an hour early, `past` means the recording
 * is what the student wants, and `upcoming` deliberately offers no link at all.
 * `unscheduled` is a lesson the teacher has not dated yet.
 */
export type LessonState = "past" | "live" | "upcoming" | "unscheduled";

export type LessonWithState = {
  lesson: ScheduledLesson;
  state: LessonState;
  /** "08-р сарын 24, Даваа" — empty when the lesson has no date. */
  dateLabel: string;
  /** "18:00–20:00" — empty when the lesson has no time. */
  timeLabel: string;
};

/** A lesson counts as "live" from fifteen minutes before it starts. */
const JOIN_EARLY_MS = 15 * 60 * 1000;
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

type TimedLesson = { lesson: ScheduledLesson; start: Date; end: Date; endTime: string };

function withTimes(lessons: ScheduledLesson[]): TimedLesson[] {
  return lessons
    .map((lesson) => {
      const { date, startTime, endTime } = parseScheduleString(lesson.schedule ?? "");
      const start = toLocalDate(date, startTime);
      if (!start) return null;
      const end = toLocalDate(date, endTime) ?? new Date(start.getTime() + ASSUMED_LENGTH_MS);
      return { lesson, start, end, endTime };
    })
    .filter((x): x is TimedLesson => x !== null);
}

/**
 * Annotates every lesson with where it sits relative to `now`, keeping the
 * teacher's original ordering — that is the curriculum order students expect,
 * not chronological order.
 */
export function getLessonStates(lessons: ScheduledLesson[] | undefined, now: Date): LessonWithState[] {
  if (!lessons?.length) return [];
  const ms = now.getTime();

  return lessons.map((lesson) => {
    const [timed] = withTimes([lesson]);
    if (!timed) {
      return { lesson, state: "unscheduled" as const, dateLabel: "", timeLabel: "" };
    }
    const state: LessonState =
      ms > timed.end.getTime()
        ? "past"
        : ms >= timed.start.getTime() - JOIN_EARLY_MS
          ? "live"
          : "upcoming";
    return {
      lesson,
      state,
      dateLabel: formatLessonDate(timed.start),
      timeLabel: formatTimeRange(timed.start, timed.endTime),
    };
  });
}

function formatLessonDate(start: Date): string {
  const weekday = WEEKDAY_NAMES_MN[start.getDay()];
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  return `${month}-р сарын ${day}, ${weekday}`;
}

function formatTimeRange(start: Date, endTime: string): string {
  const hh = String(start.getHours()).padStart(2, "0");
  const mm = String(start.getMinutes()).padStart(2, "0");
  return endTime ? `${hh}:${mm}–${endTime}` : `${hh}:${mm}`;
}

const WEEKDAY_NAMES_MN = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
