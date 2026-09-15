/**
 * Хувааж төлөх — the 50/50 plan offered on the year-long programmes and the
 * classroom groups.
 *
 * Half is taken at enrollment through the ordinary payment flow; the rest is
 * promised for a date the family picks — within a month of enrolling — and
 * recorded by the admin when it arrives (`registration_payments`). Nothing
 * here charges anybody: it only decides who may split, into what, and by when.
 */

export type PaymentPlan = "full" | "split";

export function isPaymentPlan(value: unknown): value is PaymentPlan {
  return value === "full" || value === "split";
}

/**
 * The two halves, in tögrög. The first is what the invoice will be for, so
 * the pair must always add back up to the full price exactly.
 */
export function splitHalves(total: number): { now: number; later: number } {
  const now = Math.round(total / 2);
  return { now, later: total - now };
}

/**
 * Only the long, expensive commitments split: the year-long programmes and
 * the classroom groups. A recorded course bought for 350,000₮ is not what
 * this is for.
 */
export function canSplitPayment(input: { isYearlyProgram: boolean; template?: string }): boolean {
  return input.isYearlyProgram || input.template === "songon";
}

/** Tomorrow, as the date input's floor — a "next payment" cannot be today. */
export function earliestInstallmentDate(now = new Date()): string {
  const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

/** Ulaanbaatar is UTC+8 all year — Mongolia has no daylight saving. */
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * One month from today: enrol on the 14th of September and the rest is due by
 * the 14th of October.
 *
 * A month, not a fixed calendar date. The deadline used to be written down as
 * "2026-10-01", which meant the whole split-payment option would switch itself
 * off on that day — and the family would only see "choose a valid date".
 *
 * "Today" is counted on the ULAANBAATAR calendar, not UTC. Counted in UTC, a
 * family enrolling at 2am would be handed a deadline a day short of the rule,
 * because it is still yesterday in UTC until 8am local. Reading the date this
 * way also makes the browser and the server agree: both shift the same instant
 * by the same offset, whatever timezone the browser happens to be in.
 *
 * The day is clamped to the end of the target month, because "one month after
 * the 31st of January" has to land somewhere real: it becomes the 28th (or the
 * 29th), never the 3rd of March, which is where plain month arithmetic lands.
 */
export function latestInstallmentDate(now = new Date()): string {
  const ub = new Date(now.getTime() + UB_OFFSET_MS);
  const year = ub.getUTCFullYear();
  const month = ub.getUTCMonth();
  // Day 0 of the month after next is the last day of next month.
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  const day = Math.min(ub.getUTCDate(), lastDay);
  return new Date(Date.UTC(year, month + 1, day)).toISOString().slice(0, 10);
}

/** True when the chosen date is a real day between tomorrow and a month out. */
export function isValidInstallmentDate(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return value >= earliestInstallmentDate(now) && value <= latestInstallmentDate(now);
}
