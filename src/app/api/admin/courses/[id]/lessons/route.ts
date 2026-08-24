import { NextResponse } from "next/server";
import { findCourseById, findYearlyProgramById, notifyNewRecordings, updateCourse, updateYearlyProgram } from "@/lib/db";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { normalizeLessons, validateLessons } from "@/lib/lessonInput";

/**
 * Saves a course's lesson schedule and nothing else.
 *
 * A separate endpoint from the course PUT on purpose. That route writes the
 * price, the published flag and the Facebook group, so it stays owner-only;
 * a teacher needs to add a recording or fix a time without being handed the
 * ability to change what a course costs. Two endpoints keep that boundary
 * where it can be seen, instead of one route deciding field by field.
 *
 * Works for a course uuid or a yearly programme id, like every other lesson
 * endpoint.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json().catch(() => ({}));

  if (!Array.isArray(data.lessons)) {
    return NextResponse.json({ ok: false, error: "Хичээлийн хуваарь дутуу байна" }, { status: 400 });
  }
  const lessonError = validateLessons(data.lessons);
  if (lessonError) {
    return NextResponse.json({ ok: false, error: lessonError }, { status: 400 });
  }
  const lessons = normalizeLessons(data.lessons) ?? [];

  const yearlyProgram = await findYearlyProgramById(id);
  const course = yearlyProgram ? undefined : await findCourseById(id);
  const owner = yearlyProgram ?? course;
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }

  const previous = owner.lessons ?? [];
  const updated = yearlyProgram
    ? await updateYearlyProgram(id, { lessons })
    : await updateCourse(id, { lessons });
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Хадгалахад алдаа гарлаа" }, { status: 500 });
  }

  const label = yearlyProgram ? yearlyProgram.label : `${course!.title} (${course!.tag})`;
  // Same side effect the course PUT has: a recording that just appeared is
  // worth telling that course's students about. Fire-and-forget, as there.
  notifyNewRecordings(id, label, previous, lessons).catch((err) =>
    console.error("[lessons] recording notification failed:", err)
  );

  await logAdminAction(request, {
    actionType: "lesson.schedule_update",
    targetId: id,
    details: { title: label, lessons: lessons.length },
  });

  return NextResponse.json({ ok: true, lessons });
}
