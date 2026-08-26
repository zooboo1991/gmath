import { NextResponse } from "next/server";
import { findAssessment, restoreAssessment } from "@/lib/assessment/db";
import { logAdminAction } from "@/lib/adminLog";
import { REFUSED, requireCapability } from "@/lib/adminAccess";

/** Undoes a cancel: the sitting goes back to the queue as handed-in work. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("grading")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }
  if (assessment.status !== "cancelled") {
    return NextResponse.json(
      { ok: false, error: "Зөвхөн цуцалсан шалгалтыг сэргээнэ." },
      { status: 409 }
    );
  }

  const restored = await restoreAssessment(id);
  await logAdminAction(request, { actionType: "assessment.restore", targetId: id });
  return NextResponse.json({ ok: true, assessment: restored });
}
