/**
 * Багшийн намтрын тоо өөр хоорондоо зөрөхгүй байх.
 *
 * Жилийн задаргааг гараар бичсэн тул нэг оронг андуурахад хуудсан дээр
 * "772 медаль" гэж бичээд доор нь өөр дүн гарах эрсдэлтэй. Энэ тест
 * задаргааг нийт дүнтэй нь тулгана.
 */

import { describe, expect, it } from "vitest";
import {
  BATCHIMEG_START_YEAR,
  BATCHIMEG_TOTAL_MEDALS,
  batchimegMedalsByYear,
  batchimegTeachingYear,
} from "@/lib/batchimegProfile";

describe("Б.Батчимэг багшийн намтар", () => {
  it("жилийн задаргааны нийлбэр нийт медальтай таарна", () => {
    const sum = batchimegMedalsByYear.reduce((all, one) => all + one.count, 0);
    expect(sum).toBe(BATCHIMEG_TOTAL_MEDALS);
  });

  it("жилүүд шинэ нь эхэндээ, давхардалгүй", () => {
    const labels = batchimegMedalsByYear.map((one) => one.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect([...labels].sort().reverse()).toEqual(labels);
  });

  it("багшилсан жилийг он тутам өөрөө нэмнэ", () => {
    expect(batchimegTeachingYear(new Date("2026-06-01T00:00:00Z"))).toBe(35);
    expect(batchimegTeachingYear(new Date("2027-06-01T00:00:00Z"))).toBe(36);
    expect(BATCHIMEG_START_YEAR).toBe(1991);
  });
});
