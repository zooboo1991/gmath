import { NextResponse } from "next/server";
import { updateAssessment } from "@/lib/assessment/db";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";
import { getPaymentProvider, stubPaymentsEnabled } from "@/lib/assessment/payment";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  // Paying twice for the same assessment must be impossible, however the
  // client got here (double click, retried request, back button).
  const step = requireStatus(guard.assessment, ["awaiting_payment"]);
  if (!step.ok) {
    return NextResponse.json({ ok: false, error: "Төлбөр аль хэдийн төлөгдсөн байна" }, { status: 409 });
  }

  const provider = getPaymentProvider();
  // The stub must not quietly hand out free assessments in production —
  // that is exactly the hole the course-enrollment QPay path has today.
  if (provider.name === "stub" && !stubPaymentsEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Төлбөрийн систем хараахан идэвхжээгүй байна. Та бидэнтэй холбогдоно уу." },
      { status: 503 }
    );
  }

  const intent = await provider.charge(guard.assessment.amount ?? "");
  const assessment = await updateAssessment(id, {
    status: "paid",
    payment_provider: intent.provider,
    payment_ref: intent.reference,
    paid_at: intent.paidAt,
  });

  return NextResponse.json({ ok: true, assessment });
}
