import { NextResponse } from "next/server";
import { addRegistrationPayment, findRegistrationById } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Logs one installment payment against a registration — see the schema comment on registration_payments. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json().catch(() => ({}));
  const amount = Number(data.amount);
  const paidAt = typeof data.paidAt === "string" ? data.paidAt.trim() : "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "Төлсөн дүн буруу байна" }, { status: 400 });
  }
  if (!DATE_RE.test(paidAt)) {
    return NextResponse.json({ ok: false, error: "Огноо буруу байна" }, { status: 400 });
  }

  const registration = await findRegistrationById(id);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  const payment = await addRegistrationPayment({ registrationId: id, amount, paidAt });

  await logAdminAction(request, {
    actionType: "registration.add_payment",
    targetId: id,
    details: { programId: registration.programId, amount, paidAt },
  });

  return NextResponse.json({ ok: true, payment });
}
