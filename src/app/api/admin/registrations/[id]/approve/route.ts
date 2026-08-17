import { approveRegistration, findRegistrationById, settleRegistrationPayment } from "@/lib/db";
import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/adminLog";
import { getPaymentProvider } from "@/lib/payment";
import { isFullAdmin } from "@/lib/session";

/**
 * Confirms a registration by hand — the bank-transfer flow, where the admin
 * reading their statement is the only possible confirmation.
 *
 * A row reaching here may still carry a live QPay invoice (the student opened
 * the QR, then transferred instead). Approving it without voiding that invoice
 * leaves the QR payable for as long as it exists: the parent's banking app
 * keeps it in history, and a scan weeks later takes the fee a second time with
 * nothing on our side to refund it. So: ask QPay first — if the money came
 * through after all that settles the row and no void is needed — otherwise void
 * the invoice before granting the seat, and refuse rather than grant a seat
 * while the QR is still live.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await findRegistrationById(id);
  if (existing?.status === "pending" && existing.qpayInvoiceId) {
    let settled: Awaited<ReturnType<typeof settleRegistrationPayment>>;
    try {
      settled = await settleRegistrationPayment(id);
    } catch (err) {
      console.error("[registration.approve] qpay check failed", id, err);
      return NextResponse.json(
        { ok: false, error: "QPay-ээс шалгаж чадсангүй. Дахин оролдоно уу." },
        { status: 502 }
      );
    }

    // QPay had taken the money — the row is active now, by QPay's own record.
    if (settled && settled.status === "active") {
      return NextResponse.json({ ok: true, registration: settled, paid: true });
    }

    try {
      await getPaymentProvider().cancelPayment(existing.qpayInvoiceId);
    } catch (err) {
      console.error("[registration.approve] invoice void failed", id, err);
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

  const registration = await approveRegistration(id);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "registration.approve",
    targetId: id,
    details: { programId: registration.programId, programLabel: registration.programLabel, price: registration.price },
  });

  return NextResponse.json({ ok: true, registration });
}
