import { NextResponse } from "next/server";
import { findRegistrationById, settleRegistrationPayment } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";

/**
 * Asks QPay whether a pending registration was in fact paid.
 *
 * The admin's first move on a pending QPay row should be to ask the payment
 * processor, not to override it — so this exists to make that the easy button.
 * It settles the row only on QPay's own answer; nothing here can mark a
 * registration paid by itself.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;

  const registration = await findRegistrationById(id);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }
  // Only the stored invoice id matters — see settleRegistrationPayment.
  if (!registration.qpayInvoiceId) {
    return NextResponse.json(
      { ok: false, error: "Энэ бүртгэлд QPay нэхэмжлэх байхгүй." },
      { status: 400 }
    );
  }

  try {
    const settled = await settleRegistrationPayment(id);
    const current = settled ?? registration;
    const paid = current.status === "active";

    if (paid) {
      await logAdminAction(request, {
        actionType: "registration.qpay_check_paid",
        targetId: id,
        details: { programId: current.programId, price: current.price },
      });
    }
    return NextResponse.json({ ok: true, registration: current, paid });
  } catch (err) {
    console.error("[admin] qpay check failed", id, err);
    return NextResponse.json(
      { ok: false, error: "QPay-ээс шалгахад алдаа гарлаа. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}
