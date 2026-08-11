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
