/**
 * «Бичлэг» — a video lesson: a Bunny recording that opens at its scheduled
 * time. No Zoom room, no end time, no roll call, and nothing to watch before
 * it opens (pure helpers; the routes are in tests/api).
 */

import { describe, expect, it } from "vitest";
import { getLessonStates, recordingOpen } from "@/lib/lessonSchedule";
import { normalizeLessons, validateLessons } from "@/lib/lessonInput";
import { lessonKind } from "@/lib/onlineCourse";
import { summariseAttendance } from "@/lib/courseAttendance";

const BUNNY_ID = "0f6b4f9a-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
// Даваа 2026.10.19 09:00 in Ulaanbaatar is 01:00 UTC.
const video = { topic: "Гурвалжин 1", schedule: "2026.10.19 Даваа гараг · 09:00", mode: "recorded" as const };

describe("a video lesson's state", () => {
  const at = (utc: string) => getLessonStates([video], new Date(utc))[0].state;

  it("is not open even a minute before its time — no early join as for Zoom", () => {
    expect(at("2026-10-19T00:59:00Z")).toBe("upcoming");
  });

  it("is the open one on top for the day it opens, then joins the past lessons", () => {
    expect(at("2026-10-19T01:00:00Z")).toBe("live");
    expect(at("2026-10-19T12:59:00Z")).toBe("live");
    expect(at("2026-10-19T13:01:00Z")).toBe("past");
  });

  it("may be watched from its opening time, or at once when it has no date", () => {
    expect(recordingOpen(video, new Date("2026-10-19T00:59:00Z"))).toBe(false);
    expect(recordingOpen(video, new Date("2026-10-19T01:00:00Z"))).toBe(true);
    expect(recordingOpen({ mode: "recorded" }, new Date("2026-01-01T00:00:00Z"))).toBe(true);
    // Other kinds of lesson are not gated by this.
    expect(recordingOpen({ ...video, mode: "online" }, new Date("2026-10-18T00:00:00Z"))).toBe(true);
  });
});

describe("saving a video lesson", () => {
  it("keeps only its opening time and drops any Zoom link", () => {
    const [saved] = normalizeLessons([
      { ...video, schedule: "2026.10.19 Даваа гараг · 09:00–11:00", zoomLink: "https://zoom.us/j/1", recordingLink: BUNNY_ID },
    ])!;
    expect(saved).toMatchObject({ mode: "recorded", schedule: "2026.10.19 Даваа гараг · 09:00", recordingLink: BUNNY_ID });
    expect(saved.zoomLink).toBeUndefined();
  });

  it("takes a Bunny video and nothing else", () => {
    expect(validateLessons([{ ...video, recordingLink: BUNNY_ID }])).toBeNull();
    expect(validateLessons([{ ...video, recordingLink: `https://iframe.mediadelivery.net/embed/123456/${BUNNY_ID}` }])).toBeNull();
    expect(validateLessons([{ ...video }])).toBeNull();
    expect(validateLessons([{ ...video, recordingLink: "https://drive.google.com/file/d/abc/view" }])).toMatch(/Bunny/);
    // An ordinary lesson's recording may still live on Drive.
    expect(validateLessons([{ ...video, mode: "online", recordingLink: "https://drive.google.com/file/d/abc/view" }])).toBeNull();
  });
});

describe("a video lesson elsewhere", () => {
  it("counts as a video on the online course page whatever its topic says", () => {
    expect(lessonKind("Гурвалжин 1", "recorded")).toBe("video");
    expect(lessonKind("Гурвалжин 1 (Zoom)", "recorded")).toBe("video");
    expect(lessonKind("Гурвалжин 1")).toBe("other");
  });

  it("is left out of the attendance roll, keeping the course-wide numbering", () => {
    const summary = summariseAttendance({
      lessons: [video, { topic: "Гурвалжин 3", schedule: "2026.10.23 Баасан гараг · 19:00–21:00", mode: "online" }],
      spansByLessonIndex: {},
      trackedLessonIndexes: new Set(),
      rollCallByLessonIndex: {},
      watchedLessonIndexes: new Set(),
      now: new Date("2026-11-01T00:00:00Z"),
    });
    expect(summary.lessons.map((l) => l.lessonIndex)).toEqual([1]);
  });
});
