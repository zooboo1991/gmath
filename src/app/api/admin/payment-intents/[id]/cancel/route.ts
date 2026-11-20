import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/adminLog";
import { cancelIntentByAdmin, paymentsAfterIntent } from "@/lib/paymentIntents";
import { isFullAdmin } from "@/lib/session";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * «Цуцлах» on a balance payment the family never made. Kept, not deleted, so
 * the list still shows what was started and dropped.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Төлөлт олдсонгүй" }, { status: 404 });
  }
  const result = await cancelIntentByAdmin(id);
  if (!result.ok) {
    // A QPay payment found on the way is booked; the list then shows it as paid.
    const payments = result.paid ? await paymentsAfterIntent(id) : undefined;
    return NextResponse.json({ ok: false, error: result.error, paid: result.paid, payments }, { status: result.status });
  }
  await logAdminAction(request, {
    actionType: "registration.balance_cancel",
    targetId: result.intent.registrationId,
    details: { intentId: id, amount: result.intent.amount, method: result.intent.method },
  });
  return NextResponse.json({ ok: true, intent: result.intent });
}

