import { NextResponse } from "next/server";
import {
  deleteRegistration,
  findRegistrationById,
  setRegistrationTotalDue,
  settleRegistrationPayment,
} from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { getPaymentProvider } from "@/lib/payment";
import { isFullAdmin } from "@/lib/session";

/**
 * Admin removing a registered student from a course/program — any status,
 * unlike .../cancel which only handles pending rows.
 *
 * A pending QPay row still has a live invoice behind it, and deleting the row
 * without voiding that invoice leaves a payable QR pointing at nothing: the
 * student scans it an hour later, the money moves, the callback finds no
 * registration to activate, and nobody is any the wiser. So this route does the
 * same two-step as .../cancel — settle first (a payment that just landed always
 * wins over a delete click), then void — before removing the row.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  // Fetched before the delete purely so the log entry can say what was
  // removed — a bare id is useless six months later.
  const registration = await findRegistrationById(id);

  // Keyed on the stored invoice id, not pay_method — a row can read "bank" and
  // still hold a live QPay invoice (see settleRegistrationPayment).
  if (registration?.status === "pending" && registration.qpayInvoiceId) {
    const settled = await settleRegistrationPayment(id).catch(() => undefined);
    const current = settled ?? registration;

    if (current.status === "pending" && current.qpayInvoiceId) {
      try {
        await getPaymentProvider().cancelPayment(current.qpayInvoiceId);
      } catch (err) {
        // Includes QPay's INVOICE_PAID: the payment arrived in the gap between
        // the settle above and this call. Either way the invoice may still be
        // payable, so the row must not be deleted — the admin can retry.
        console.error("[registration.delete] invoice void failed", id, err);
        return NextResponse.json(
          {
            ok: false,
            error:
              "QPay-ийн нэхэмжлэлийг цуцалж чадсангүй — төлбөр яг одоо орсон байж магадгүй. Хуудсаа сэргээж дахин шалгана уу.",
          },
          { status: 502 }
        );
      }
    }
  }

  const deleted = await deleteRegistration(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "registration.delete",
    targetId: id,
    details: {
      programId: registration?.programId,
      programLabel: registration?.programLabel,
      status: registration?.status,
      price: registration?.price,
    },
  });

  return NextResponse.json({ ok: true });
}

/** Sets the actual agreed total for a student — yearly-program installment tracking, see the schema comment on registrations.total_due. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json().catch(() => ({}));
  const totalDue = Number(data.totalDue);
  if (!Number.isFinite(totalDue) || totalDue < 0) {
    return NextResponse.json({ ok: false, error: "Төлөх дүн буруу байна" }, { status: 400 });
  }

  const registration = await setRegistrationTotalDue(id, totalDue);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "registration.set_total_due",
    targetId: id,
    details: { programId: registration.programId, totalDue },
  });

  return NextResponse.json({ ok: true, registration });
}
