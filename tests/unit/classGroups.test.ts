/**
 * Танхимын анги — хичээл, хүүхэд хоёрын анги таарах эсэх (pure, no server).
 */

import { describe, expect, it } from "vitest";
import { classGroupLabel, cleanClassGroup, inClassGroup } from "@/lib/classGroups";
import { normalizeLessons } from "@/lib/lessonInput";
import { summariseAttendance, type AttendanceLesson } from "@/lib/courseAttendance";

describe("class of a child and of a lesson", () => {
  it("expects a child at their own class's lessons and at everyone's", () => {
    expect(inClassGroup(1, 1)).toBe(true);
    expect(inClassGroup(1, undefined)).toBe(true);
    expect(inClassGroup(1, 2)).toBe(false);
  });

  it("expects a child not yet placed at every class's lessons", () => {
    expect(inClassGroup(undefined, 1)).toBe(true);
    expect(inClassGroup(undefined, 2)).toBe(true);
  });

  it("reads a class only from 1 or 2", () => {
    expect(cleanClassGroup(1)).toBe(1);
    expect(cleanClassGroup("2")).toBe(2);
    expect(cleanClassGroup(3)).toBeUndefined();
    expect(cleanClassGroup(1.5)).toBeUndefined();
    expect(cleanClassGroup("")).toBeUndefined();
    expect(cleanClassGroup(null)).toBeUndefined();
  });

  it("names a class the way the school does", () => {
    expect(classGroupLabel(2)).toBe("2-р анги");
  });
});

describe("a lesson's class when the timetable is saved", () => {
  it("keeps a class only on an in-person lesson", () => {
    const [classroom, online, recorded] = normalizeLessons([
      { topic: "Хичээл №35", mode: "inperson", group: 2 },
      { topic: "Хичээл №36", mode: "online", group: 1 },
      { topic: "Хичээл №37", mode: "recorded", group: 1 },
    ])!;
    expect(classroom.group).toBe(2);
    expect(online.group).toBeUndefined();
    expect(recorded.group).toBeUndefined();
  });

  it("drops a class that is not one", () => {
    const [lesson] = normalizeLessons([{ topic: "Хичээл №35", mode: "inperson", group: 7 }])!;
    expect(lesson.group).toBeUndefined();
  });
});

describe("a child's attendance in a split classroom", () => {
  const lessons: AttendanceLesson[] = [
    { topic: "Онлайн", mode: "online", schedule: "2026.11.10 Мягмар гараг · 19:00–21:00" },
    { topic: "1-р анги", mode: "inperson", group: 1, schedule: "2026.11.15 Ням гараг · 11:00–13:00" },
    { topic: "2-р анги", mode: "inperson", group: 2, schedule: "2026.11.15 Ням гараг · 13:30–15:30" },
  ];
  const summarise = (classGroup?: number) =>
    summariseAttendance({
      lessons,
      spansByLessonIndex: {},
      trackedLessonIndexes: new Set(),
      rollCallByLessonIndex: { 1: true, 2: false },
      watchedLessonIndexes: new Set(),
      classGroup,
      now: new Date("2026-11-20T00:00:00Z"),
    });

  it("leaves the other class's lesson out, keeping the course-wide numbering", () => {
    expect(summarise(1).lessons.map((l) => l.lessonIndex)).toEqual([0, 1]);
    expect(summarise(2).lessons.map((l) => l.lessonIndex)).toEqual([0, 2]);
  });

  it("never counts the other class's lesson as missed", () => {
    expect(summarise(1).absent).toBe(0);
    expect(summarise(1).present).toBe(1);
  });

  it("shows a child not yet placed every lesson", () => {
    expect(summarise(undefined).lessons).toHaveLength(3);
  });
});
