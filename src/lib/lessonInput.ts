import type { Lesson } from "./db";
import { parseBunnyVideoId } from "./bunnyVideo";
import { isLessonNotePath } from "./storage";
import { isTooLong, isValidHttpUrl, MAX_LEN } from "./validate";

/**
 * Shared between the course POST and PUT routes. Both used to inline their own
 * copy of this mapping, which is how a newly added lesson field can silently
 * fail to save: anything the mapper does not name is dropped.
 */

type LessonInput = {
  topic?: string;
  schedule?: string;
  mode?: string;
  zoomLink?: string;
  recordingLink?: string;
  noteFile?: string;
  noteSize?: number;
};

export function normalizeLessons(input: unknown): Lesson[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return (input as LessonInput[])
    .map((l) => ({
      topic: l.topic?.trim() ?? "",
      schedule: l.schedule?.trim() || undefined,
      mode: l.mode === "inperson" ? ("inperson" as const) : ("online" as const),
      // In-person lessons have no Zoom room — a mode switch shouldn't leave
      // a stale link a student could still be shown.
      zoomLink: l.mode === "inperson" ? undefined : l.zoomLink?.trim() || undefined,
      recordingLink: l.recordingLink?.trim() || undefined,
      // Only ever a path this app minted (see createNoteUploadUrl). A hand-made
      // request could otherwise name any object in the bucket — or a key that
      // does not exist, leaving a "Тэмдэглэл" button that opens nothing.
      noteFile: isLessonNotePath(l.noteFile) ? l.noteFile : undefined,
      noteSize:
        isLessonNotePath(l.noteFile) && typeof l.noteSize === "number" && l.noteSize > 0
          ? Math.round(l.noteSize)
          : undefined,
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
      if (typeof value !== "string" || !value.trim()) continue;
      // A Bunny video id is not a URL, and it is the value the Bunny dashboard
      // labels "Video ID" — refusing it here contradicted the editor, which
      // already tells the teacher such a value will play in-page.
      if (label === "Бичлэгийн холбоос" && parseBunnyVideoId(value)) continue;
      if (!isValidHttpUrl(value)) {
        return `Хичээлийн ${label} буруу байна (http:// эсвэл https:// -ээр эхэлнэ)`;
      }
    }
  }
  return null;
}
