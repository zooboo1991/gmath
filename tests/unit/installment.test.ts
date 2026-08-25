/**
 * Хувааж төлөх — who may split, into what, and by when.
 */

import { describe, expect, it } from "vitest";
import {
  canSplitPayment,
  earliestInstallmentDate,
  INSTALLMENT_DEADLINE,
  isValidInstallmentDate,
  splitHalves,
} from "@/lib/installment";

describe("splitting a fee in two", () => {
  it("halves the price so the parts add back up exactly", () => {
    expect(splitHalves(1_200_000)).toEqual({ now: 600_000, later: 600_000 });
    expect(splitHalves(2_800_000)).toEqual({ now: 1_400_000, later: 1_400_000 });
    // An odd tögrög cannot vanish between the two halves.
    const odd = splitHalves(350_001);
    expect(odd.now + odd.later).toBe(350_001);
  });

  it("is offered on the year-long programmes and the classroom groups only", () => {
    expect(canSplitPayment({ isYearlyProgram: true })).toBe(true);
    expect(canSplitPayment({ isYearlyProgram: false, template: "songon" })).toBe(true);
    expect(canSplitPayment({ isYearlyProgram: false })).toBe(false);
    expect(canSplitPayment({ isYearlyProgram: false, template: "vod" })).toBe(false);
  });
});

describe("the promised date", () => {
  const now = new Date("2026-08-25T04:00:00Z");

  it("cannot be today or earlier", () => {
    expect(isValidInstallmentDate("2026-08-25", now)).toBe(false);
    expect(isValidInstallmentDate("2026-08-01", now)).toBe(false);
    expect(isValidInstallmentDate(earliestInstallmentDate(now), now)).toBe(true);
  });

  it("cannot be after the deadline", () => {
    expect(isValidInstallmentDate(INSTALLMENT_DEADLINE, now)).toBe(true);
    expect(isValidInstallmentDate("2026-10-02", now)).toBe(false);
  });

  it("refuses anything that is not a date", () => {
    for (const value of ["", "маргааш", "2026-9-1", "2026-10-01T00:00:00Z"]) {
      expect(isValidInstallmentDate(value, now), value).toBe(false);
    }
  });
});
