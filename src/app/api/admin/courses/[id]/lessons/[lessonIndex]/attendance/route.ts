import { NextResponse } from "next/server";
import { findLessonMeeting, listAttendanceForLessonWithNames } from "@/lib/zoom/db";
import { REFUSED, requireCapability } from "@/lib/adminAccess";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; lessonIndex: string }> }) {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const { id: courseId, lessonIndex: lessonIndexRaw } = await params;
  const lessonIndex = Number(lessonIndexRaw);
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0) {
    return NextResponse.json({ ok: false, error: "Буруу хичээлийн дугаар" }, { status: 400 });
  }

  const meeting = await findLessonMeeting(courseId, lessonIndex);
  if (!meeting) {
    return NextResponse.json({ ok: true, attendance: [] });
  }
  const attendance = await listAttendanceForLessonWithNames(meeting.id);
  return NextResponse.json({ ok: true, attendance });
}
