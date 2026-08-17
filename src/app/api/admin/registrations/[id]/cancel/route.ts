import { NextResponse } from "next/server";
import { cancelPendingRegistration, findRegistrationById, settleRegistrationPayment } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { getPaymentProvider } from "@/lib/payment";
import { isFullAdmin } from "@/lib/session";

/**
 * Admin-side counterpart to /api/enroll/[id]/cancel — takes a registration a
 * student abandoned (closed the QR, payment never arrived) out of the
 * "Баталгаажуулах" queue, where it would otherwise sit forever, indistinguishable
 * from one genuinely awaiting a bank transfer.
 *
 * The row is marked cancelled, not deleted: what was cancelled, for whom and for
 * how much stays readable in the admin list afterwards. It holds no seat and
 * doesn't stop that student registering for the course again.
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
  if (registration.status === "cancelled") {
    return NextResponse.json({ ok: true, registration });
  }
  if (registration.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "Энэ бүртгэл аль хэдийн баталгаажсан байна", paid: true },
      { status: 409 }
    );
  }

  try {
    // Catch a payment that only just arrived — QPay's own record of a paid
    // invoice always wins over an admin cancel click, so the registration
    // must never be cancelled out from under it.
    const settled = await settleRegistrationPayment(id);
    const current = settled ?? registration;
    if (current.status !== "pending") {
      return NextResponse.json(
        { ok: false, error: "Төлбөр аль хэдийн баталгаажсан байна", paid: true, registration: current },
        { status: 409 }
      );
    }

    if (current.qpayInvoiceId) {
      await getPaymentProvider().cancelPayment(current.qpayInvoiceId);
    }
    const cancelled = await cancelPendingRegistration(id);

    await logAdminAction(request, {
      actionType: "registration.cancel_pending",
      targetId: id,
      details: { programId: registration.programId, programLabel: registration.programLabel, price: registration.price },
    });

    return NextResponse.json({ ok: true, registration: cancelled });
  } catch (err) {
    console.error("admin registration cancel failed", id, err);
    // QPay refuses to void an invoice it has collected on. That is not a
    // transient failure to retry — it means the money is in, and the honest
    // answer is to say so rather than "try again".
    if (err instanceof Error && err.message.includes("INVOICE_PAID")) {
      return NextResponse.json(
        {
          ok: false,
          error: "QPay дээр төлбөр төлөгдсөн байна — цуцлах боломжгүй. «QPay-ээс шалгах» дарж баталгаажуулна уу.",
          paid: true,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: "Цуцлахад алдаа гарлаа. Дахин оролдоно уу." }, { status: 502 });
  }
}
