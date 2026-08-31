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
  mode?: "online" | "inperson";
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
  /**
   * Хичээл эхлэхэд үлдсэн миллисекунд. Эхэлсэн бол сөрөг, хуваарьгүй
   * хичээл дээр undefined. Тоолуур харуулахад хэрэглэнэ.
   */
  startsInMs?: number;
};

/** A lesson counts as "live" from fifteen minutes before it starts. */
const JOIN_EARLY_MS = 15 * 60 * 1000;
/** How long a lesson is assumed to run when no end time was entered. */
const ASSUMED_LENGTH_MS = 2 * 60 * 60 * 1000;

type TimedLesson = {
  lesson: ScheduledLesson;
  start: Date;
  end: Date;
  date: string;
  startTime: string;
  endTime: string;
};

function withTimes(lessons: ScheduledLesson[]): TimedLesson[] {
  return lessons
    .map((lesson) => {
      const { date, startTime, endTime } = parseScheduleString(lesson.schedule ?? "");
      // Хичээлийн цаг Монголын хананы цагаар бичигдсэн байдаг тул үүнийг
      // жинхэнэ агшин болгон хөрвүүлнэ. Урьд нь браузерын локал цагаар
      // барьдаг байсан нь сервер дээр (UTC) 8 цагаар зөрдөг, гадаадад
      // байгаа сурагчид ч буруу харагддаг байв.
      const start = mongoliaLocalToUtc(date, startTime);
      if (!start) return null;
      const end = mongoliaLocalToUtc(date, endTime) ?? new Date(start.getTime() + ASSUMED_LENGTH_MS);
      return { lesson, start, end, date, startTime, endTime };
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
      dateLabel: formatLessonDate(timed.date),
      timeLabel: formatTimeRange(timed.startTime, timed.endTime),
      startsInMs: timed.start.getTime() - ms,
    };
  });
}

/**
 * "5 цаг 20 минут", "3 хоног 4 цаг", "12 минут" — хичээл эхлэхэд үлдсэн
 * хугацаа. Хамгийн том хоёр нэгжийг л хэлнэ: сурагчид «2 хоног 4 цаг 13
 * минут» гэдэг нарийвчлал хэрэггүй, «удахгүй» эсэхийг л мэдэх хэрэгтэй.
 * Хугацаа өнгөрсөн бол хоосон.
 */
export function formatTimeUntil(ms: number): string {
  if (ms <= 0) return "";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "1 минут";

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days} хоног ${hours} цаг` : `${days} хоног`;
  if (hours > 0) return minutes > 0 ? `${hours} цаг ${minutes} минут` : `${hours} цаг`;
  return `${minutes} минут`;
}

/** "08-р сарын 24, Даваа" — хуваарийн мөрөнд бичигдсэн огноогоор. */
function formatLessonDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  const weekday = getWeekdayNameMn(isoDate);
  return `${month}-р сарын ${day}${weekday ? `, ${weekday}` : ""}`;
}

function formatTimeRange(startTime: string, endTime: string): string {
  return endTime ? `${startTime}–${endTime}` : startTime;
}
