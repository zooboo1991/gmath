/**
 * Онлайн олимпиадын сургалтын хуудас — хичээл, долоо хоногийн хэмнэлээс уншдаг зүйлс (pure, no server).
 */

import { describe, expect, it } from "vitest";
import { courseTotals, courseWeeks, infoSessionOf, isInfoSession, lessonKind, lessonSubject, lessonTitle, weeklyRhythm } from "@/lib/onlineCourse";
import { planCourseTasks, taskState } from "@/lib/courseTasks";

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

  it("leaves the parents' info meeting out of the weeks and the totals", () => {
    const withMeeting = [
      { topic: "Мэдээлэл өгөх уулзалт (Zoom)", schedule: "2026.10.17 Бямба гараг · 16:00–17:00" },
      ...lessons,
    ];
    expect(isInfoSession(" мэдээлэл өгөх уулзалт")).toBe(true);
    expect(isInfoSession("Гурвалжин 3 (Zoom)")).toBe(false);
    expect(courseWeeks(withMeeting).map((w) => w.start)).toEqual(["2026-10-19", "2026-10-26"]);
    expect(courseTotals(withMeeting, rhythm)).toEqual(courseTotals(lessons, rhythm));
  });

  it("shows the info meeting with its Zoom link until its day is over", () => {
    const meeting = { topic: "Мэдээлэл өгөх уулзалт", schedule: "2026.10.24 Бямба гараг · 16:00–17:00" };
    const before = new Date("2026-10-21T04:00:00Z");
    expect(infoSessionOf([meeting, ...lessons], before)).toEqual({ when: "2026.10.24 (Бямба) 16:00 · Zoom", zoomUrl: undefined });
    expect(infoSessionOf([{ ...meeting, zoomLink: "https://zoom.us/j/1" }], before)?.zoomUrl).toBe("https://zoom.us/j/1");
    // 2026-10-24 23:00 in Ulaanbaatar is still the day; the next morning it is gone.
    expect(infoSessionOf([meeting], new Date("2026-10-24T15:00:00Z"))).toBeDefined();
    expect(infoSessionOf([meeting], new Date("2026-10-25T01:00:00Z"))).toBeUndefined();
    expect(infoSessionOf(lessons, before)).toBeUndefined();
  });
});

describe("course papers: plan and state", () => {
  it("plans a homework per homework line and a test per test line, every week, named after the week's videos", () => {
    const plan = planCourseTasks({ lessons, weeklySchedule: rhythm.map((r) => `${r.day} ${r.time} · ${r.text}`).join("\n") });
    expect(plan.map((p) => [p.kind, p.title])).toEqual([
      ["homework", "Даалгавар 1: Үнэлгээний бодлогууд 1"],
      ["homework", "Даалгавар 2: Үнэлгээний бодлогууд 2"],
      ["test", "Сорил 1: Үнэлгээний бодлогууд"],
      ["homework", "Даалгавар 3: Гурвалжин 1"],
      // Week 2 has one video lesson: the second homework takes the week's subject.
      ["homework", "Даалгавар 4: Гурвалжин"],
      ["test", "Сорил 2: Гурвалжин"],
    ]);
    expect(plan[0].opensAt).toBe("2026-10-20T01:00:00.000Z"); // Мягмар 09:00 in Ulaanbaatar
    expect(plan[0].closesAt).toBe("2026-10-20T13:00:00.000Z");
  });

  it("numbers homework in week order, skips look-alike lines, and closes a late window the next day", () => {
    const plan = planCourseTasks({
      lessons: lessons.slice(1, 4),
      weeklySchedule: [
        "Пүрэв 09:00–21:00 · Даалгавар 2: 3–5 бодлого",
        "Мягмар 09:00–21:00 · Даалгавар 1: 3–5 бодлого",
        "Ням 20:00–02:00 · Сорил: вэб системд",
        "Бямба 10:00–11:00 · Сорилын хариу: Zoom-оор",
      ].join("\n"),
    });
    expect(plan.map((p) => [p.title, p.opensAt, p.closesAt])).toEqual([
      ["Даалгавар 1: Үнэлгээний бодлогууд 1", "2026-10-20T01:00:00.000Z", "2026-10-20T13:00:00.000Z"],
      ["Даалгавар 2: Үнэлгээний бодлогууд 2", "2026-10-22T01:00:00.000Z", "2026-10-22T13:00:00.000Z"],
      // Ням 20:00 to Даваа 02:00, Ulaanbaatar time.
      ["Сорил 1: Үнэлгээний бодлогууд", "2026-10-25T12:00:00.000Z", "2026-10-25T18:00:00.000Z"],
    ]);
  });

  it("only a paper handed in counts; a paper not handed in by its close is missed", () => {
    const task = { opensAt: "2026-10-20T01:00:00Z", closesAt: "2026-10-20T13:00:00Z", status: "open" as const, problemCount: 3 };
    const at = (iso: string) => new Date(iso);
    expect(taskState(task, undefined, at("2026-10-20T00:00:00Z"))).toBe("upcoming");
    expect(taskState(task, undefined, at("2026-10-20T05:00:00Z"))).toBe("open");
    expect(taskState({ ...task, problemCount: 0 }, undefined, at("2026-10-20T05:00:00Z"))).toBe("preparing");
    expect(taskState(task, { status: "questionnaire_done" }, at("2026-10-20T05:00:00Z"))).toBe("in_progress");
    expect(taskState(task, { status: "questionnaire_done" }, at("2026-10-20T14:00:00Z"))).toBe("missed");
    expect(taskState(task, { status: "problems_submitted" }, at("2026-10-20T14:00:00Z"))).toBe("submitted");
    expect(taskState(task, { status: "completed" }, at("2026-10-21T00:00:00Z"))).toBe("graded");
  });
});
