import { NextResponse } from "next/server";
import { settleAssessmentPayment, updateAssessment } from "@/lib/assessment/db";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";
import { getPaymentProvider, stubPaymentsEnabled } from "@/lib/payment";
import { parsePriceToNumber } from "@/lib/price";
import { SITE_URL } from "@/lib/siteUrl";

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
  // that is exactly the hole the course-enrollment QPay path used to have.
  if (provider.name === "stub" && !stubPaymentsEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Төлбөрийн систем хараахан идэвхжээгүй байна. Та бидэнтэй холбогдоно уу." },
      { status: 503 }
    );
  }

  try {
    // Resume: an invoice already exists from a previous attempt at this
    // step. Recheck it first — the student may already have paid and just
    // refreshed before the callback landed — and otherwise hand back the
    // same QR rather than creating a second invoice, since QPay's
    // sender_invoice_no can never be reused once issued.
    if (guard.assessment.paymentInvoiceId) {
      const settled = await settleAssessmentPayment(id);
      const current = settled ?? guard.assessment;
      if (current.status !== "awaiting_payment") {
        return NextResponse.json({ ok: true, assessment: current, paid: true });
      }
      return NextResponse.json({
        ok: true,
        assessment: current,
        paid: false,
        qrImage: current.paymentQrImage,
        shortUrl: current.paymentShortUrl,
      });
    }

    const start = await provider.createPayment({
      amountMnt: parsePriceToNumber(guard.assessment.amount),
      description: `Түвшин тогтоох үнэлгээ — ${guard.user.lastName} ${guard.user.firstName}`,
      senderInvoiceNo: `gmath-assessment-${id}`,
      callbackUrl: `${SITE_URL}/api/qpay/callback?type=assessment&ref=${id}`,
    });

    if (start.paid) {
      const assessment = await updateAssessment(id, {
        status: "paid",
        payment_provider: start.provider,
        payment_ref: start.reference,
        paid_at: start.paidAt,
      });
      return NextResponse.json({ ok: true, assessment, paid: true });
    }

    const assessment = await updateAssessment(id, {
      payment_provider: start.provider,
      payment_invoice_id: start.invoiceId,
      payment_qr_image: start.qrImage,
      payment_short_url: start.shortUrl,
    });
    return NextResponse.json({ ok: true, assessment, paid: false, qrImage: start.qrImage, shortUrl: start.shortUrl });
  } catch (err) {
    console.error("assessment payment failed", id, err);
    // TEMP DEBUG — remove before merging: surface the raw error to diagnose
    // the live QPay credential rollout.
    return NextResponse.json(
      {
        ok: false,
        error: "Төлбөрийн систем рүү холбогдоход алдаа гарлаа. Дахин оролдоно уу.",
        debug: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
