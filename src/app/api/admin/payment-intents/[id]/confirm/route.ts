import { NextResponse } from "next/server";
import { listPaymentsForRegistrations } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { confirmIntentManually, paymentsAfterIntent } from "@/lib/paymentIntents";
import { isFullAdmin } from "@/lib/session";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * «Баталгаажуулах» on a balance payment from the registrations list: the
 * admin has seen the transfer on the statement and books the amount and the
 * date that arrived. The same answer as confirming a pending bank registration.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Төлөлт олдсонгүй" }, { status: 404 });
  }
  const data = await request.json().catch(() => ({}));
  const amount = (data as { amount?: unknown }).amount;
  const paidAt = typeof (data as { paidAt?: unknown }).paidAt === "string" ? ((data as { paidAt: string }).paidAt).trim() : "";
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "Орсон дүн буруу байна" }, { status: 400 });
  }
  const ubToday = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (!DATE_RE.test(paidAt) || Number.isNaN(Date.parse(`${paidAt}T00:00:00Z`)) || paidAt > ubToday) {
    return NextResponse.json({ ok: false, error: "Огноо буруу байна" }, { status: 400 });
  }

  const result = await confirmIntentManually(id, { amount, paidAt });
  if (!result.ok) {
    // A QPay payment found on the way is booked; the list then shows it as paid.
    const payments = result.paid ? await paymentsAfterIntent(id) : undefined;
    return NextResponse.json({ ok: false, error: result.error, paid: result.paid, payments }, { status: result.status });
  }
  await logAdminAction(request, {
    actionType: "registration.balance_confirm",
    targetId: result.intent.registrationId,
    details: { intentId: id, amount, paidAt },
  });
  return NextResponse.json({
    ok: true,
    intent: result.intent,
    payments: await listPaymentsForRegistrations([result.intent.registrationId]),
  });
}
