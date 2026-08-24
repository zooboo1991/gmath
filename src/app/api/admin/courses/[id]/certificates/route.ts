import { NextResponse } from "next/server";
import { findCourseById, findYearlyProgramById, issueCertificatesForProgram } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isTooLong, MAX_LEN } from "@/lib/validate";
import { isFullAdmin } from "@/lib/session";

/**
 * Issues certificates to everyone confirmed on a finished course.
 *
 * Owner-only: a certificate is a statement the school makes about a student,
 * so it sits with the same account that approves payments, not with a
 * teacher's login.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;

  // programId is a yearly programme id or a course uuid, like every other
  // endpoint that takes one.
  const owner = (await findYearlyProgramById(id)) ?? (await findCourseById(id));
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }

  const data = await request.json().catch(() => ({}));
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const course = text(data.course);
  const studentCategory = text(data.studentCategory);
  const teacherCategory = text(data.teacherCategory);
  const issuedDate = text(data.issuedDate);

  if (!course || !studentCategory || !teacherCategory) {
    return NextResponse.json(
      { ok: false, error: "Курс болон ангиллыг бөглөнө үү" },
      { status: 400 }
    );
  }
  for (const value of [course, studentCategory, teacherCategory]) {
    if (isTooLong(value, MAX_LEN.certificateNumber)) {
      return NextResponse.json({ ok: false, error: "Талбар хэт урт байна" }, { status: 400 });
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedDate)) {
    return NextResponse.json({ ok: false, error: "Огноог сонгоно уу" }, { status: 400 });
  }

  const { created, skipped } = await issueCertificatesForProgram({
    programId: id,
    studentCategory,
    teacherCategory,
    course,
    issuedDate,
  });

  if (created.length > 0) {
    await logAdminAction(request, {
      actionType: "certificate.issue_batch",
      targetId: id,
      details: { course, issued: String(created.length), skipped: String(skipped) },
    });
  }

  return NextResponse.json({ ok: true, created: created.length, skipped, certificates: created });
}
