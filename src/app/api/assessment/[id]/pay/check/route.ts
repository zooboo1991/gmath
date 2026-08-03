import { NextResponse } from "next/server";
import { settleAssessmentPayment } from "@/lib/assessment/db";
import { requireOwnAssessment } from "@/lib/assessment/guard";

/**
 * Manual/polled confirmation for a pending QPay invoice — the client hits
 * this after the callback should have landed (or a student clicks "Шалгах"
 * themselves), since callback delivery isn't guaranteed and QPay forbids
 * checking payments from a server-side cron job.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  if (guard.assessment.status !== "awaiting_payment") {
    return NextResponse.json({ ok: true, assessment: guard.assessment, paid: true });
  }

  try {
    const settled = await settleAssessmentPayment(id);
    const current = settled ?? guard.assessment;
    return NextResponse.json({ ok: true, assessment: current, paid: current.status !== "awaiting_payment" });
  } catch (err) {
    console.error("assessment payment check failed", id, err);
    return NextResponse.json(
      { ok: false, error: "Төлбөр шалгахад алдаа гарлаа. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}
