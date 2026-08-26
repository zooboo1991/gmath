import { NextResponse } from "next/server";
import { cancelAssessment, findAssessment } from "@/lib/assessment/db";
import { logAdminAction } from "@/lib/adminLog";
import { REFUSED, requireCapability } from "@/lib/adminAccess";

/**
 * Voids a sitting so the student can take it again from the beginning.
 *
 * The case this exists for: a child photographs the wrong page. Nothing is
 * deleted — the row and its photos stay for the record — but every query that
 * asks "does this student have an exam" stops seeing it, so their next
 * attempt is a first attempt.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("grading")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }
  if (assessment.status === "cancelled") {
    return NextResponse.json({ ok: true, assessment });
  }
  if (assessment.status === "completed") {
    return NextResponse.json(
      { ok: false, error: "Дүгнэлт гарсан шалгалтыг цуцлах боломжгүй." },
      { status: 409 }
    );
  }

  const cancelled = await cancelAssessment(id);
  await logAdminAction(request, {
    actionType: "assessment.cancel",
    targetId: id,
    details: { previousStatus: assessment.status },
  });
  return NextResponse.json({ ok: true, assessment: cancelled });
}
