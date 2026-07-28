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
