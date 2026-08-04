import { NextResponse } from "next/server";
import { findCourseById, updateCourse } from "@/lib/db";
import { parseScheduleString } from "@/lib/lessonSchedule";
import { isAdmin } from "@/lib/session";
import { createMeeting } from "@/lib/zoom/client";
import {
  createLessonMeeting,
  deleteRegistrantsForLessonMeeting,
  findLessonMeeting,
  updateLessonMeeting,
} from "@/lib/zoom/db";

const DEFAULT_DURATION_MINUTES = 60;

/** Zoom's start_time, paired with a separate timezone field, wants a plain local datetime with no offset/Z. */
function zoomSchedule(scheduleString: string | undefined): { startTime: string; durationMinutes: number } | undefined {
  if (!scheduleString) return undefined;
  const { date, startTime, endTime } = parseScheduleString(scheduleString);
  if (!date || !startTime) return undefined;

  let durationMinutes = DEFAULT_DURATION_MINUTES;
  if (endTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    if (diff > 0) durationMinutes = diff;
  }

  return { startTime: `${date}T${startTime}:00`, durationMinutes };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; lessonIndex: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id: courseId, lessonIndex: lessonIndexRaw } = await params;
  const lessonIndex = Number(lessonIndexRaw);
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0) {
    return NextResponse.json({ ok: false, error: "Буруу хичээлийн дугаар" }, { status: 400 });
  }

  const course = await findCourseById(courseId);
  const lesson = course?.lessons?.[lessonIndex];
  if (!course || !lesson) {
    return NextResponse.json({ ok: false, error: "Хичээл олдсонгүй" }, { status: 404 });
  }

  // force=true is the admin's "meeting-ээ дахин үүсгэх" escape hatch — for
  // when the tracked meeting was deleted directly on Zoom's side (e.g. via
  // zoom.us), which this app has no way to detect on its own.
  const body = await req.json().catch(() => ({}));
  const force = (body as { force?: boolean })?.force === true;

  const existingRow = await findLessonMeeting(courseId, lessonIndex);
  let meeting = force ? undefined : existingRow;
  if (!meeting) {
    try {
      const zoomMeeting = await createMeeting(`${course.title} — ${lesson.topic}`, zoomSchedule(lesson.schedule));
      if (force && existingRow) {
        // Update in place (same row id) rather than delete+insert, so
        // lesson_attendance history — which references this id — survives.
        meeting = await updateLessonMeeting(existingRow.id, {
          zoomMeetingId: zoomMeeting.id,
          joinUrl: zoomMeeting.joinUrl,
          startUrl: zoomMeeting.startUrl,
        });
        // Old registrant links point at a meeting that no longer exists —
        // clear them so each student gets silently re-registered on the new
        // meeting the next time they click "Хичээлд орох".
        await deleteRegistrantsForLessonMeeting(existingRow.id);
      } else {
        meeting = await createLessonMeeting({
          courseId,
          lessonIndex,
          zoomMeetingId: zoomMeeting.id,
          joinUrl: zoomMeeting.joinUrl,
          startUrl: zoomMeeting.startUrl,
        });
      }
    } catch (err) {
      console.error("zoom meeting creation failed", courseId, lessonIndex, err);
      return NextResponse.json(
        { ok: false, error: "Zoom meeting үүсгэхэд алдаа гарлаа. Дахин оролдоно уу." },
        { status: 502 }
      );
    }
  }

  // The student-facing join button is gated on lessons[i].zoomLink (see
  // ProfileClient's LessonAction) — persist it onto the course row itself so
  // the button appears right away, instead of depending on the admin also
  // clicking "Хадгалах" afterward to save the client-side form state.
  if (course.lessons[lessonIndex].zoomLink !== meeting.joinUrl) {
    const lessons = course.lessons.map((l, i) => (i === lessonIndex ? { ...l, zoomLink: meeting!.joinUrl } : l));
    await updateCourse(courseId, { lessons });
  }

  return NextResponse.json({ ok: true, meeting });
}
