/**
 * Хуваарийг нэг цагийн нүд болгож хуваах.
 *
 * Нүднүүд нь тусдаа тохиргоо биш, ангиудын хуваариас гардаг тул энд хуваарь
 * ямар байсан ч эвдрэхгүй байх нь чухал: багш "14:00-16:30" гэж бичихэд
 * 45 минутын уулзалт санал болгож эхлэх ёсгүй.
 */

import { describe, expect, it } from "vitest";
import {
  bookableDays,
  buildAssessmentSlots,
  isBookable,
  splitIntoHours,
} from "@/lib/placementBooking";

describe("нэг цагийн нүд", () => {
  it("бүтэн цагуудад хуваана", () => {
    expect(splitIntoHours("10:30–12:30")).toEqual(["10:30–11:30", "11:30–12:30"]);
    expect(splitIntoHours("09:00–11:00")).toEqual(["09:00–10:00", "10:00–11:00"]);
  });

  it("бүтэн цаг багтахгүй үлдэгдлийг хаяна", () => {
    // 11:30–12:00 бол 30 минут — уулзалт болгож санал болгохгүй.
    expect(splitIntoHours("10:30–12:00")).toEqual(["10:30–11:30"]);
    // Нэг цаг ч гүйцэхгүй бол огт нүд гарахгүй.
    expect(splitIntoHours("10:30–11:00")).toEqual([]);
  });

  it("энгийн зураасыг ч хүлээж авна", () => {
    // Хуваарийг гараар бичдэг тул en dash биш энгийн зураас орох нь бий.
    expect(splitIntoHours("14:00-16:00")).toEqual(["14:00–15:00", "15:00–16:00"]);
  });

  it("эвдэрсэн мөрөнд унахгүй", () => {
    for (const value of ["", "цаг", "10:30", "25:00–26:00", "12:30–10:30", "10:70–11:70"]) {
      expect(splitIntoHours(value), value).toEqual([]);
    }
  });
});

describe("гарагаар цуглуулах", () => {
  it("олон ангийн цагийг нэг гарагт нийлүүлж, давхардлыг арилгана", () => {
    const days = buildAssessmentSlots([
      { weeklySchedule: "Даваа 10:30–12:30\nБаасан 09:00–11:00" },
      { weeklySchedule: "Даваа 14:30–16:30\nБаасан 09:00–11:00" },
    ]);
    const monday = days.find((one) => one.day === "Даваа");
    expect(monday?.slots).toEqual([
      "10:30–11:30",
      "11:30–12:30",
      "14:30–15:30",
      "15:30–16:30",
    ]);
    // Хоёр анги ижил баасангийн цагтай — нүд нь нэг л удаа гарна.
    const friday = days.find((one) => one.day === "Баасан");
    expect(friday?.slots).toEqual(["09:00–10:00", "10:00–11:00"]);
  });

  it("долоо хоногийн дарааллаар эрэмбэлнэ", () => {
    const days = buildAssessmentSlots([
      { weeklySchedule: "Баасан 09:00–11:00\nДаваа 10:30–12:30\nЛхагва 10:30–12:30" },
    ]);
    expect(days.map((one) => one.day)).toEqual(["Даваа", "Лхагва", "Баасан"]);
  });

  it("танихгүй гарагийг орхино", () => {
    expect(buildAssessmentSlots([{ weeklySchedule: "Monday 10:30–12:30" }])).toEqual([]);
  });
});

describe("захиалж болох өдрүүд", () => {
  // 2026-09-15 бол Мягмар.
  const now = new Date("2026-09-15T04:00:00Z");

  it("маргаашаас эхэлнэ — өнөөдрийг санал болгохгүй", () => {
    const days = bookableDays([{ day: "Мягмар", slots: ["10:30–11:30"] }], now);
    expect(days.every((one) => one.date > "2026-09-15")).toBe(true);
    // Дараагийн Мягмар бол 09-22.
    expect(days[0]?.date).toBe("2026-09-22");
  });

  it("хоёр долоо хоногийн дотор л санал болгоно", () => {
    const days = bookableDays([{ day: "Даваа", slots: ["10:30–11:30"] }], now);
    expect(days.every((one) => one.date <= "2026-09-29")).toBe(true);
    expect(days.map((one) => one.date)).toEqual(["2026-09-21", "2026-09-28"]);
  });

  it("нүдгүй гараг огт харагдахгүй", () => {
    expect(bookableDays([{ day: "Бямба", slots: [] }], now)).toEqual([]);
  });

  it("хуваарьт байхгүй өдөр, цагийг татгалзана", () => {
    const slots = [{ day: "Даваа", slots: ["10:30–11:30"] }];
    expect(isBookable(slots, "2026-09-21", "10:30–11:30", now)).toBe(true);
    // Зөв өдөр, буруу цаг.
    expect(isBookable(slots, "2026-09-21", "14:30–15:30", now)).toBe(false);
    // Зөв цаг, буруу гараг (09-22 бол Мягмар).
    expect(isBookable(slots, "2026-09-22", "10:30–11:30", now)).toBe(false);
    // Цонхноос гадуур.
    expect(isBookable(slots, "2026-10-05", "10:30–11:30", now)).toBe(false);
  });
});
