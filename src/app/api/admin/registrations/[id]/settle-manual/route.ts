import { NextResponse } from "next/server";
import { findRegistrationById, settleRegistrationOutsideQpay } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { getPaymentProvider } from "@/lib/payment";
import { isFullAdmin } from "@/lib/session";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "The money arrived, just not through QPay."
 *
 * The deliberate exception, kept separate from `approve` so that confirming a
 * QPay row can never be a one-click accident: it demands the amount and the
 * date, writes a payment record, and flips pay_method to "bank" so the books
 * describe the transfer that really happened.
 *
 * It also voids the QPay invoice. Leaving it OPEN is how a parent ends up
 * paying twice — they still have the QR in their history, and QPay would
 * happily take a second 350,000₮ that nothing in this system would refund.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json().catch(() => ({}));

  const amount = Number(data.amount);
  const paidAt = typeof data.paidAt === "string" ? data.paidAt.trim() : "";
  const reference = typeof data.reference === "string" ? data.reference.trim().slice(0, 60) : "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "Төлсөн дүн буруу байна" }, { status: 400 });
  }
  if (!DATE_RE.test(paidAt)) {
    return NextResponse.json({ ok: false, error: "Огноо буруу байна" }, { status: 400 });
  }

  const existing = await findRegistrationById(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }
  if (existing.status === "active") {
    return NextResponse.json({ ok: false, error: "Энэ бүртгэл аль хэдийн идэвхтэй байна" }, { status: 409 });
  }

  // Void first. If this fails the registration stays pending and the admin can
  // retry — the opposite order would leave a live invoice against an already
  // confirmed seat, which is the expensive mistake.
  if (existing.qpayInvoiceId) {
    try {
      await getPaymentProvider().cancelPayment(existing.qpayInvoiceId);
    } catch (err) {
      console.error("[admin] voiding the invoice failed", id, err);
      return NextResponse.json(
        {
          ok: false,
          error:
            "QPay нэхэмжлэхийг цуцлаж чадсангүй. Дахин төлөгдөх эрсдэлтэй тул баталгаажуулсангүй — дахин оролдоно уу.",
        },
        { status: 502 }
      );
    }
  }

  const settled = await settleRegistrationOutsideQpay(id, { amount, paidAt });

  await logAdminAction(request, {
    actionType: "registration.settle_manual",
    targetId: id,
    details: {
      programId: existing.programId,
      programLabel: existing.programLabel,
      amount,
      paidAt,
      reference: reference || undefined,
      qpayInvoiceId: existing.qpayInvoiceId ?? undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    registration: settled?.registration,
    // Админы жагсаалт үүнийг шууд өөрийн төлбөрийн жагсаалтдаа нэмнэ.
    payment: settled?.payment,
  });
}
