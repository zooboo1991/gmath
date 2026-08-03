import { NextResponse } from "next/server";
import { findCourseById } from "@/lib/db";
import { isAdmin } from "@/lib/session";
import { createMeeting } from "@/lib/zoom/client";
import { createLessonMeeting, findLessonMeeting } from "@/lib/zoom/db";

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
    const zoomMeeting = await createMeeting(`${course.title} — ${lesson.topic}`);
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
