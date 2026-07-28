// Course start dates (and lesson dates) used to be free-typed as
// "2026.08.10". The admin form now uses a native <input type="date">,
// which requires/produces ISO "YYYY-MM-DD". These helpers convert between
// the two so existing dot-formatted values keep displaying correctly and
// new ones keep working with the date picker.

const WEEKDAY_NAMES_MN = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOT_RE = /^(\d{4})\.(\d{2})\.(\d{2})$/;

/** Convert any known date format to ISO "YYYY-MM-DD" for <input type="date">. */
export function toIsoDate(value: string | undefined | null): string {
  if (!value) return "";
  if (ISO_RE.test(value)) return value;
  const m = value.match(DOT_RE);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}

/** Convert ISO "YYYY-MM-DD" to the site's display format "YYYY.MM.DD". Passes legacy dot-format values through unchanged. */
export function formatCourseDate(value: string | undefined | null): string {
  if (!value) return "";
  if (ISO_RE.test(value)) return value.replaceAll("-", ".");
  return value;
}

/** Mongolian weekday name for an ISO "YYYY-MM-DD" date, or "" if unparseable. */
export function getWeekdayNameMn(isoDate: string): string {
  if (!ISO_RE.test(isoDate)) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";
  return WEEKDAY_NAMES_MN[date.getDay()];
}
