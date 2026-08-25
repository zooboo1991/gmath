/**
 * Хувааж төлөх — the 50/50 plan offered on the year-long programmes and the
 * classroom groups.
 *
 * Half is taken at enrollment through the ordinary payment flow; the rest is
 * promised for a date the family picks, and recorded by the admin when it
 * arrives (`registration_payments`). Nothing here charges anybody — it only
 * decides who may split, into what, and by when.
 */

/** Everything must be settled before the school year gets under way. */
export const INSTALLMENT_DEADLINE = "2026-10-01";

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

/** True when the chosen date is a real day between tomorrow and the deadline. */
export function isValidInstallmentDate(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return value >= earliestInstallmentDate(now) && value <= INSTALLMENT_DEADLINE;
}
