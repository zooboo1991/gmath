import { NextResponse } from "next/server";
import { deleteRegistration, findRegistrationById, settleRegistrationPayment } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment";
import { getSessionUser } from "@/lib/session";

/**
 * Lets a student back out of a registration attempt they don't intend to
 * finish (closed the QR, changed their mind about the payment method).
 * Deletes the row outright — a pending registration is otherwise stuck
 * forever, since (user_id, program_id) is unique and there's no other way
 * to free that slot for a fresh attempt.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const registration = await findRegistrationById(id);
  if (!registration || registration.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  if (registration.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "Энэ бүртгэл аль хэдийн баталгаажсан байна", paid: true },
      { status: 409 }
    );
  }

  try {
    // Catch a payment that only just completed — QPay's own record of a
    // paid invoice always wins over a cancel click that lost the race, so
    // the registration must never be deleted out from under it.
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("enroll cancel failed", id, err);
    return NextResponse.json({ ok: false, error: "Цуцлахад алдаа гарлаа. Дахин оролдоно уу." }, { status: 502 });
  }
}
