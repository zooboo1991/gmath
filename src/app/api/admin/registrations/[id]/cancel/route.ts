import { NextResponse } from "next/server";
import { deleteRegistration, findRegistrationById, settleRegistrationPayment } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { getPaymentProvider } from "@/lib/payment";
import { isAdmin } from "@/lib/session";

/**
 * Admin-side counterpart to /api/enroll/[id]/cancel — clears out a
 * registration a student abandoned (closed the QR, payment never arrived)
 * instead of leaving it stuck in the "Баталгаажуулах" queue forever, with
 * no way to tell it apart from one genuinely awaiting a bank transfer.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;

  const registration = await findRegistrationById(id);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
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
    // must never be deleted out from under it.
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
    await deleteRegistration(id);

    await logAdminAction(request, {
      actionType: "registration.cancel_pending",
      targetId: id,
      details: { programLabel: registration.programLabel, price: registration.price },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin registration cancel failed", id, err);
    return NextResponse.json({ ok: false, error: "Цуцлахад алдаа гарлаа. Дахин оролдоно уу." }, { status: 502 });
  }
}
