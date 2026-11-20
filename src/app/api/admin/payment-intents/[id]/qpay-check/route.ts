import { NextResponse } from "next/server";
import { listPaymentsForRegistrations } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { checkIntentWithQpay } from "@/lib/paymentIntents";
import { isFullAdmin } from "@/lib/session";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** «QPay шалгах» on a balance payment: books it only on QPay's own answer, like the callback. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Төлөлт олдсонгүй" }, { status: 404 });
  }
  const result = await checkIntentWithQpay(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  if (result.paid) {
    await logAdminAction(request, {
      actionType: "registration.balance_qpay_check",
      targetId: result.intent.registrationId,
      details: { intentId: id, amount: result.intent.amount, paid: true },
    });
  }
  return NextResponse.json({
    ok: true,
    paid: Boolean(result.paid),
    intent: result.intent,
    payments: await listPaymentsForRegistrations([result.intent.registrationId]),
  });
}
