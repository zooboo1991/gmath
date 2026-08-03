import { NextResponse } from "next/server";
import { findCourseById } from "@/lib/db";
import { parseScheduleString } from "@/lib/lessonSchedule";
import { isAdmin } from "@/lib/session";
import { createMeeting } from "@/lib/zoom/client";
import { createLessonMeeting, findLessonMeeting } from "@/lib/zoom/db";

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
  _req: Request,
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

  const existing = await findLessonMeeting(courseId, lessonIndex);
  if (existing) {
    return NextResponse.json({ ok: true, meeting: existing });
  }

  try {
    const zoomMeeting = await createMeeting(`${course.title} — ${lesson.topic}`, zoomSchedule(lesson.schedule));
    const meeting = await createLessonMeeting({
      courseId,
      lessonIndex,
      zoomMeetingId: zoomMeeting.id,
      joinUrl: zoomMeeting.joinUrl,
      startUrl: zoomMeeting.startUrl,
    });
    return NextResponse.json({ ok: true, meeting });
  } catch (err) {
    console.error("zoom meeting creation failed", courseId, lessonIndex, err);
    return NextResponse.json(
      { ok: false, error: "Zoom meeting үүсгэхэд алдаа гарлаа. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}
