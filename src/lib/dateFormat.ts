/**
 * Deterministic date formatting for anything that renders during SSR.
 *
 * toLocaleDateString("mn-MN") is a hydration bug in disguise: Node's ICU has
 * the Mongolian locale ("2026.08.07") while most browsers don't and fall back
 * to en-US ("8/7/2026"), so the server HTML and the client render disagree
 * and React flags every such date. These produce the same string everywhere —
 * and it's the same YYYY.MM.DD style the site already uses for course dates.
 */

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const UB_OFFSET_MS = 8 * 60 * 60 * 1000; // Ulaanbaatar is UTC+8 all year, no DST.

/**
 * Ulaanbaatar wall-clock time, identical on the server and in the browser.
 * formatDateTime above reads the runtime's own clock — UTC on Vercel — so the
 * server renders a payment made at 18:13 as 10:13 and the browser then
 * disagrees on hydration.
 */
export function formatDateTimeUb(iso: string): string {
  const d = new Date(Date.parse(iso) + UB_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** The Ulaanbaatar calendar day of a timestamp as YYYY-MM-DD — what an <input type="date"> holds. */
export function ubDay(iso: string): string {
  return new Date(Date.parse(iso) + UB_OFFSET_MS).toISOString().slice(0, 10);
}
