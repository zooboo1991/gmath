/**
 * Хүүхдийн суух гараг — огноотой түүх, хичээлд хамаарах эсэх (pure, no server).
 */

import { describe, expect, it } from "vitest";
import {
  attendsLesson,
  attendsOn,
  changeAttendDays,
  classWeekdays,
  cleanDays,
  daysOn,
  describeDays,
  readAttendDays,
  weekdayOf,
} from "@/lib/attendDays";

// A Мягмар/Пүрэв/Баасан class, as «Өдрийн анги, Тэгш» meets.
const CLASS = [2, 4, 5];

describe("weekdays of dates and classes", () => {
  it("reads the weekday of a calendar date", () => {
    expect(weekdayOf("2026-10-06")).toBe(2); // Мягмар
    expect(weekdayOf("2026-10-09")).toBe(5); // Баасан
    expect(weekdayOf("2026-10-4")).toBeNull();
    expect(weekdayOf("2026-02-31")).toBeNull();
  });

  it("finds the days a class meets from its dated lessons, Monday first", () => {
    const lessons = [
      { schedule: "2026.10.09 Баасан гараг · 16:00–18:00" },
      { schedule: "2026.10.06 Мягмар гараг · 15:30–17:30" },
      { schedule: "2026.10.08 Пүрэв гараг · 15:30–17:30" },
      { schedule: "" },
    ];
    expect(classWeekdays(lessons)).toEqual(CLASS);
    expect(describeDays([4, 2])).toBe("Мягмар, Пүрэв");
  });

  it("does not count a one-off make-up day among the class's days", () => {
    const week = (d: string, name: string) => ({ schedule: `${d} ${name} гараг · 15:30–17:30` });
    const lessons = [
      week("2026.10.06", "Мягмар"),
      week("2026.10.08", "Пүрэв"),
      week("2026.10.09", "Баасан"),
      week("2026.10.13", "Мягмар"),
      week("2026.10.15", "Пүрэв"),
      week("2026.10.16", "Баасан"),
      week("2026.10.17", "Бямба"), // a make-up lesson
    ];
    expect(classWeekdays(lessons)).toEqual(CLASS);
  });

  it("accepts only distinct weekday numbers", () => {
    expect(cleanDays([4, 2, 4])).toEqual([2, 4]);
    expect(cleanDays([7])).toBeNull();
    expect(cleanDays("2,4")).toBeNull();
  });
});

describe("which days are in force on a date", () => {
  const history = [
    { from: null, days: null },
    { from: "2026-10-08", days: [2, 4] },
  ];

  it("uses the last change on or before the date", () => {
    expect(daysOn(history, "2026-10-02")).toBeNull();
    expect(daysOn(history, "2026-10-08")).toEqual([2, 4]);
    expect(daysOn(history, "2026-10-16")).toEqual([2, 4]);
  });

  it("expects the child only on their days, and everyone when nothing is set", () => {
    expect(attendsOn(history, "2026-10-02")).toBe(true); // a Friday before the change
    expect(attendsOn(history, "2026-10-16")).toBe(false); // a Friday after it
    expect(attendsOn(history, "2026-10-13")).toBe(true);
    expect(attendsOn(undefined, "2026-10-16")).toBe(true);
    expect(attendsLesson(history, "2026.10.16 Баасан гараг · 16:00–18:00")).toBe(false);
    // A lesson without a readable date stays on everyone's list.
    expect(attendsLesson(history, "Хуваарь тун удахгүй")).toBe(true);
  });

  it("reads stored history defensively and in date order", () => {
    expect(
      readAttendDays([
        { from: "2026-10-08", days: [4, 2] },
        { from: null, days: [2, 4, 5] },
        { from: "bad", days: [2] },
        { from: "2026-11-01", days: [] },
        "junk",
      ])
    ).toEqual([
      { from: null, days: [2, 4, 5] },
      { from: "2026-10-08", days: [2, 4] },
    ]);
    expect(readAttendDays(null)).toEqual([]);
  });
});

describe("changing a child's days", () => {
  it("from the start replaces the history; every class day is stored as none", () => {
    expect(changeAttendDays([{ from: "2026-10-08", days: [2] }], [2, 4], null, CLASS)).toEqual([{ from: null, days: [2, 4] }]);
    expect(changeAttendDays([{ from: null, days: [2] }], [2, 4, 5], null, CLASS)).toEqual([]);
  });

  it("from a date keeps what was in force before it, and drops later plans", () => {
    const before = [
      { from: null, days: [2, 4] },
      { from: "2026-10-20", days: [5] },
    ];
    expect(changeAttendDays(before, null, "2026-10-10", CLASS)).toEqual([
      { from: null, days: [2, 4] },
      { from: "2026-10-10", days: null },
    ]);
  });

  it("records nothing when the days do not actually change", () => {
    const before = [{ from: null, days: [2, 4] }];
    expect(changeAttendDays(before, [4, 2], "2026-10-10", CLASS)).toEqual(before);
    expect(changeAttendDays([], [2, 4, 5], "2026-10-10", CLASS)).toEqual([]);
  });
});
