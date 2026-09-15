import { NextResponse } from "next/server";
import { findCourseById, findYearlyProgramById, issueCertificatesForProgram } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { parseCertificateBatch } from "@/lib/certificateBatch";
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

  const parsed = parseCertificateBatch(await request.json().catch(() => ({})));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const { course, studentCategory, teacherCategory, issuedDate } = parsed.value;

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
