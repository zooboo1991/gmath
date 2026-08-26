import { NextResponse } from "next/server";
import {
  getRollCall,
  listRollCallLessons,
  mongoliaToday,
  saveRollCall,
} from "@/lib/rollCall";
import { logAdminAction } from "@/lib/adminLog";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { getAdminActor } from "@/lib/session";

/**
 * The teacher's register.
 *
 * GET with no parameters: today's classroom lessons. With `history=1`: the
 * past ones. With `courseId` and `lessonIndex`: that lesson's roster and
 * whatever marks it already has.
 */
export async function GET(request: Request) {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId");
  const lessonIndexRaw = url.searchParams.get("lessonIndex");

  if (courseId && lessonIndexRaw !== null) {
    const lessonIndex = Number(lessonIndexRaw);
    if (!Number.isInteger(lessonIndex) || lessonIndex < 0) {
      return NextResponse.json({ ok: false, error: "Буруу хичээл" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...(await getRollCall(courseId, lessonIndex)) });
  }

  const history = url.searchParams.get("history") === "1";
  const today = mongoliaToday();
  if (!history) {
    return NextResponse.json({ ok: true, today, lessons: await listRollCallLessons({ onlyDate: today }) });
  }

  // Past lessons only. Bounding this after the 40-row slice was the bug: a
  // course with lessons booked into next month filled the slice with days
  // that have not happened, and the registers actually taken fell off the end.
  const lessons = await listRollCallLessons({ before: today, limit: 40 });
  return NextResponse.json({ ok: true, today, lessons });
}

export async function PUT(request: Request) {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const courseId = typeof data.courseId === "string" ? data.courseId : "";
  const lessonIndex = Number(data.lessonIndex);
  const marks = Array.isArray(data.marks)
    ? data.marks.filter(
        (m: unknown): m is { userId: string; present: boolean } =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as { userId?: unknown }).userId === "string" &&
          typeof (m as { present?: unknown }).present === "boolean"
      )
    : [];

  if (!courseId || !Number.isInteger(lessonIndex) || lessonIndex < 0 || marks.length === 0) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const actor = await getAdminActor();
  const counts = await saveRollCall({ courseId, lessonIndex, marks, markedBy: actor?.name });
  await logAdminAction(request, {
    actionType: "lesson.roll_call",
    targetId: `${courseId}#${lessonIndex}`,
    details: { present: String(counts.present), absent: String(counts.absent) },
  });
  return NextResponse.json({ ok: true, ...counts });
}
