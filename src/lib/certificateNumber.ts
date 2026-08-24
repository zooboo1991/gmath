/**
 * Certificate numbers: "S2608001" — S for сурагч (T for багш), 26 for the
 * year, 08 for the month, then a three-digit run within that month.
 *
 * The run continues from whatever the month already holds, so a second batch
 * issued in the same month picks up where the first stopped. Numbers are
 * unique in the database, which is the real guard; this only has to be right
 * about where to carry on from.
 */

export type CertificateHolder = "student" | "teacher";

export function certificatePrefix(holder: CertificateHolder): string {
  return holder === "teacher" ? "T" : "S";
}

/** "2026-08-24" → "2608". */
export function certificatePeriod(isoDate: string): string {
  const [year = "", month = ""] = isoDate.split("-");
  return `${year.slice(-2)}${month}`;
}

/** The highest run already used for this prefix and month, 0 when there is none. */
export function highestRun(numbers: string[], prefix: string, period: string): number {
  const pattern = new RegExp(`^${prefix}${period}(\\d+)$`);
  let highest = 0;
  for (const number of numbers) {
    const match = number.trim().match(pattern);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

/** `count` fresh numbers, continuing after everything already issued. */
export function nextCertificateNumbers(
  existing: string[],
  holder: CertificateHolder,
  isoDate: string,
  count: number
): string[] {
  const prefix = certificatePrefix(holder);
  const period = certificatePeriod(isoDate);
  const start = highestRun(existing, prefix, period);
  return Array.from({ length: count }, (_, i) =>
    `${prefix}${period}${String(start + i + 1).padStart(3, "0")}`
  );
}
