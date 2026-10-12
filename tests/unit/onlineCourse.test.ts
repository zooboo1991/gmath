/**
 * Онлайн олимпиадын сургалтын хуудас — хичээл, долоо хоногийн хэмнэлээс уншдаг зүйлс (pure, no server).
 */

import { describe, expect, it } from "vitest";
import { courseTotals, courseWeeks, lessonKind, lessonSubject, lessonTitle, weeklyRhythm } from "@/lib/onlineCourse";

const lessons = [
  { topic: "Гурвалжин 3 (Zoom)", schedule: "2026.10.30 Баасан гараг · 19:00–21:00" },
  { topic: "Үнэлгээний бодлогууд 1 (видео)", schedule: "2026.10.19 Даваа гараг · 09:00" },
  { topic: "Үнэлгээний бодлогууд 2 (видео)", schedule: "2026.10.21 Лхагва гараг · 09:00" },
  { topic: "Үнэлгээний бодлогууд 3 (Zoom)", schedule: "2026.10.23 Баасан гараг · 19:00–21:00" },
  { topic: "Гурвалжин 1 (видео)", schedule: "2026.10.26 Даваа гараг · 09:00" },
  { topic: "Хуваарьгүй хичээл" },
];

const rhythm = weeklyRhythm(
  [
    "Даваа 09:00-аас · Видео хичээл 1 нээгдэнэ",
    "Мягмар 09:00–21:00 · Даалгавар 1: 3–5 бодлого",
    "Пүрэв 09:00–21:00 · Даалгавар 2: 3–5 бодлого",
    "Баасан 19:00–21:00 · Zoom хичээл: багштай шууд",
    "Ням 09:00–21:00 · Сорил: вэб системд",
    "",
  ].join("\n")
);

describe("reading a lesson's kind and subject from its topic", () => {
  it("knows video and Zoom lessons by the end of the topic", () => {
    expect(lessonKind("Гурвалжин 1 (видео)")).toBe("video");
    expect(lessonKind("Гурвалжин 3 (Zoom)")).toBe("zoom");
    expect(lessonKind("Гурвалжин")).toBe("other");
    expect(lessonTitle("Гурвалжин 3 (Zoom)")).toBe("Гурвалжин 3");
    expect(lessonSubject("Инвариант ба хагас инвариант 2 (видео)")).toBe("Инвариант ба хагас инвариант");
    expect(lessonSubject("Дирихлейн зарчим (видео)")).toBe("Дирихлейн зарчим");
  });
});

describe("weeks and totals", () => {
  it("groups dated lessons into Monday–Sunday weeks, in date order", () => {
    const weeks = courseWeeks(lessons);
    expect(weeks.map((w) => [w.number, w.start, w.end, w.subjects])).toEqual([
      [1, "2026-10-19", "2026-10-25", ["Үнэлгээний бодлогууд"]],
      [2, "2026-10-26", "2026-11-01", ["Гурвалжин"]],
    ]);
    expect(weeks[1].lessons.map((l) => [l.kind, l.weekday, l.time])).toEqual([
      ["video", "Даваа", "09:00"],
      ["zoom", "Баасан", "19:00–21:00"],
    ]);
  });

  it("reads the weekly rhythm and counts tasks and tests per week", () => {
    expect(rhythm[1]).toEqual({ day: "Мягмар", time: "09:00–21:00", text: "Даалгавар 1: 3–5 бодлого" });
    expect(courseTotals(lessons, rhythm)).toEqual({ weeks: 2, videos: 3, zooms: 2, tasks: 4, tests: 2 });
  });
});
