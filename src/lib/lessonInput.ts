import type { Lesson } from "./db";
import { isTooLong, isValidHttpUrl, MAX_LEN } from "./validate";

/**
 * Shared between the course POST and PUT routes. Both used to inline their own
 * copy of this mapping, which is how a newly added lesson field can silently
 * fail to save: anything the mapper does not name is dropped.
 */

type LessonInput = {
  topic?: string;
  schedule?: string;
  zoomLink?: string;
  recordingLink?: string;
};

export function normalizeLessons(input: unknown): Lesson[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return (input as LessonInput[])
    .map((l) => ({
      topic: l.topic?.trim() ?? "",
      schedule: l.schedule?.trim() || undefined,
      zoomLink: l.zoomLink?.trim() || undefined,
      recordingLink: l.recordingLink?.trim() || undefined,
    }))
    .filter((l) => l.topic);
}

/** Returns a Mongolian error message, or null when the lessons are fine. */
export function validateLessons(input: unknown): string | null {
  if (!Array.isArray(input)) return null;
  for (const lesson of input as LessonInput[]) {
    if (isTooLong(lesson.topic, MAX_LEN.lessonTopic) || isTooLong(lesson.schedule, MAX_LEN.lessonSchedule)) {
      return "Хичээлийн мэдээлэл хэт урт байна";
    }
    for (const [value, label] of [
      [lesson.zoomLink, "Zoom холбоос"],
      [lesson.recordingLink, "Бичлэгийн холбоос"],
    ] as const) {
      if (isTooLong(value, MAX_LEN.courseZoomLink)) return `Хичээлийн ${label} хэт урт байна`;
      if (typeof value === "string" && value.trim() && !isValidHttpUrl(value)) {
        return `Хичээлийн ${label} буруу байна (http:// эсвэл https:// -ээр эхэлнэ)`;
      }
    }
  }
  return null;
}
