/**
 * Хувааж төлөх — who may split, into what, and by when.
 */

import { describe, expect, it } from "vitest";
import {
  canSplitPayment,
  earliestInstallmentDate,
  latestInstallmentDate,
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

  it("reaches exactly one month out, and no further", () => {
    // Бүртгүүлсэн өдрөөс хойш 1 сар: 08.25-нд бүртгүүлбэл 09.25 хүртэл.
    expect(latestInstallmentDate(now)).toBe("2026-09-25");
    expect(isValidInstallmentDate("2026-09-25", now)).toBe(true);
    expect(isValidInstallmentDate("2026-09-26", now)).toBe(false);
  });

  it("lands on a real day when the month is shorter", () => {
    // 1-р сарын 31-нээс хойш 1 сар гэдэг нь 2-р сарын 31 биш — сарын сүүлээр
    // таслана, эс бөгөөс 3-р сар руу хальж, амласан хугацаа уртасна.
    expect(latestInstallmentDate(new Date("2026-01-31T04:00:00Z"))).toBe("2026-02-28");
    expect(latestInstallmentDate(new Date("2024-01-30T04:00:00Z"))).toBe("2024-02-29");
    expect(latestInstallmentDate(new Date("2026-08-31T04:00:00Z"))).toBe("2026-09-30");
  });

  it("carries over the year", () => {
    expect(latestInstallmentDate(new Date("2026-12-15T04:00:00Z"))).toBe("2027-01-15");
  });

  it("өдрийг Улаанбаатарын хуанлиар тоолно", () => {
    // Шөнө дунд–08:00 хооронд бүртгүүлсэн хүн UTC-ээр бол өчигдөр байна.
    // UTC-ээр тоолвол тэр хүнд хугацаа нэг өдрөөр богиносч, эзний дүрэмтэй
    // зөрнө. Тиймээс 09.14-ний бүх цаг ижил хариу өгөх ёстой.
    const morning = new Date("2026-09-14T01:00:00Z"); // 09.14 09:00 УБ
    const smallHours = new Date("2026-09-13T18:00:00Z"); // 09.14 02:00 УБ
    const lateNight = new Date("2026-09-14T15:59:00Z"); // 09.14 23:59 УБ
    for (const moment of [morning, smallHours, lateNight]) {
      expect(latestInstallmentDate(moment), moment.toISOString()).toBe("2026-10-14");
    }
    // Улаанбаатарын шинэ өдөр эхлэхэд л шилжинэ.
    expect(latestInstallmentDate(new Date("2026-09-14T16:01:00Z"))).toBe("2026-10-15");
  });

  it("эзний жишээ: 09.14-нд бүртгүүлбэл 10.14 хүртэл", () => {
    const enrolled = new Date("2026-09-14T04:00:00Z");
    expect(latestInstallmentDate(enrolled)).toBe("2026-10-14");
    expect(isValidInstallmentDate("2026-10-14", enrolled)).toBe(true);
    expect(isValidInstallmentDate("2026-10-15", enrolled)).toBe(false);
  });

  it("refuses anything that is not a date", () => {
    for (const value of ["", "маргааш", "2026-9-1", "2026-10-01T00:00:00Z"]) {
      expect(isValidInstallmentDate(value, now), value).toBe(false);
    }
  });
});
