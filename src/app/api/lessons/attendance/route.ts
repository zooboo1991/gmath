import { NextResponse } from "next/server";
import { findRegistrationByUserAndProgram } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { listAttendanceForUser, listLessonMeetingsForCourse } from "@/lib/zoom/db";

/** A student's own attendance across a course's tracked lessons, keyed by lesson index. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const courseId = new URL(request.url).searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const registration = await findRegistrationByUserAndProgram(user.id, courseId);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Хичээл олдсонгүй" }, { status: 404 });
  }

  const meetings = await listLessonMeetingsForCourse(courseId);
  if (meetings.length === 0) {
    return NextResponse.json({ ok: true, byLessonIndex: {} });
  }

  const attendance = await listAttendanceForUser(
    user.id,
    meetings.map((m) => m.id)
  );
  const meetingIdToLessonIndex = new Map(meetings.map((m) => [m.id, m.lessonIndex]));

  const byLessonIndex: Record<number, { joinedAt: string; leftAt?: string }[]> = {};
  for (const a of attendance) {
    const lessonIndex = meetingIdToLessonIndex.get(a.lessonMeetingId);
    if (lessonIndex === undefined) continue;
    (byLessonIndex[lessonIndex] ??= []).push({ joinedAt: a.joinedAt, leftAt: a.leftAt });
  }

  return NextResponse.json({ ok: true, byLessonIndex });
}
