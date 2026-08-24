/**
 * Certificate numbering: S2608001 — holder letter, year, month, run.
 */

import { describe, expect, it } from "vitest";
import { certificatePeriod, nextCertificateNumbers } from "@/lib/certificateNumber";

describe("certificate numbers", () => {
  it("builds the month key from the issue date", () => {
    expect(certificatePeriod("2026-08-24")).toBe("2608");
    expect(certificatePeriod("2026-01-02")).toBe("2601");
  });

  it("starts a month at 001, in the holder's own series", () => {
    expect(nextCertificateNumbers([], "student", "2026-08-24", 3)).toEqual([
      "S2608001",
      "S2608002",
      "S2608003",
    ]);
    expect(nextCertificateNumbers([], "teacher", "2026-08-24", 1)).toEqual(["T2608001"]);
  });

  it("carries on after the numbers the month already holds", () => {
    const existing = ["S2608001", "S2608002", "T2608001"];
    expect(nextCertificateNumbers(existing, "student", "2026-08-24", 2)).toEqual([
      "S2608003",
      "S2608004",
    ]);
    // The teachers' run is counted separately from the students'.
    expect(nextCertificateNumbers(existing, "teacher", "2026-08-24", 1)).toEqual(["T2608002"]);
  });

  it("ignores other months, other holders, and hand-typed numbers", () => {
    const existing = ["S2607099", "T2608050", "2026-0142", "S2608101"];
    // The highest in this month wins, whatever order they arrive in.
    expect(nextCertificateNumbers(existing, "student", "2026-08-24", 1)).toEqual(["S2608102"]);
    expect(nextCertificateNumbers(existing, "student", "2026-09-01", 1)).toEqual(["S2609001"]);
  });

  it("keeps three digits until a month genuinely needs four", () => {
    expect(nextCertificateNumbers(["S2608999"], "student", "2026-08-24", 1)).toEqual(["S26081000"]);
  });
});
