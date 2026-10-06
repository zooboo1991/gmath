import { NextResponse } from "next/server";
import { isFullAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/adminLog";
import { findRegistrationById, listPaymentsForRegistrations } from "@/lib/db";
import { findTransactions, linkedPaymentIds, updateTransaction, type BankTransaction } from "@/lib/bankStatement/db";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ORPHAN_AFTER_MS = 2 * 60 * 1000;

/**
 * The admin's decision on one transfer:
 *   link   {registrationId} — this is that student's payment (→ ready)
 *   accept                  — the suggestion shown is right (→ ready)
 *   skip                    — not a payment to record (→ skipped)
 *   reopen                  — undo a skip (→ review); also frees an approved
 *                             row whose payment is gone (deleted from the
 *                             registration, or an approve that died midway)
 * An approved row with its payment in place is final here; a wrongly recorded
 * payment is deleted from the registration itself, like any other payment.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const [tx] = UUID_RE.test(id) ? await findTransactions([id]) : [];
  if (!tx) return NextResponse.json({ ok: false, error: "Гүйлгээ олдсонгүй" }, { status: 404 });
  const data = await request.json().catch(() => ({}));
  const action = (data as { action?: unknown }).action;
  // An approve in flight has claimed the row a moment before recording; give it time.
  const orphaned =
    tx.status === "approved" && !tx.paymentId && Date.now() - Date.parse(tx.approvedAt ?? tx.createdAt) > ORPHAN_AFTER_MS;
  if (tx.status === "approved" && !(orphaned && action === "reopen")) {
    return NextResponse.json({ ok: false, error: "Батлагдсан гүйлгээг өөрчлөх боломжгүй" }, { status: 409 });
  }
  let updated: BankTransaction | undefined;

  if (action === "link") {
    const registrationId = (data as { registrationId?: unknown }).registrationId;
    const registration = typeof registrationId === "string" ? await findRegistrationById(registrationId) : undefined;
    if (!registration || registration.status === "cancelled") {
      return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 400 });
    }
    updated = await updateTransaction(
      id,
      { status: "ready", registration_id: registration.id, match_source: "admin", confidence: "high", reason: "Админ холбосон" },
      ["review", "ready", "skipped"]
    );
  } else if (action === "accept") {
    if (!tx.registrationId) {
      return NextResponse.json({ ok: false, error: "Санал болгосон бүртгэл алга" }, { status: 400 });
    }
    const registration = await findRegistrationById(tx.registrationId);
    if (!registration || registration.status === "cancelled") {
      return NextResponse.json({ ok: false, error: "Санал болгосон бүртгэл цуцлагдсан байна" }, { status: 400 });
    }
    updated = await updateTransaction(id, { status: "ready" }, ["review"]);
  } else if (action === "skip") {
    updated = await updateTransaction(id, { status: "skipped", reason: "Админ алгассан" }, ["review", "ready"]);
  } else if (action === "reopen") {
    // An approve that died after recording but before linking left the payment
    // in place: find it and tie the row to it rather than reopen the row.
    const recorded = orphaned && tx.registrationId ? await unlinkedPaymentFor(tx) : undefined;
    updated = recorded
      ? await updateTransaction(id, { payment_id: recorded, reason: "Бүртгэгдсэн төлбөр нь олдож холбогдлоо" }, ["approved"])
      : orphaned
      ? await updateTransaction(
          id,
          { status: "review", approved_at: null, approved_by: null, reason: "Төлбөр нь бүртгэлд алга тул дахин нээсэн" },
          ["approved"]
        )
      : // A skip may have tied the row to a booked payment ("already recorded");
        // reopening says it is not that payment, so the tie goes too.
        await updateTransaction(id, { status: "review", payment_id: null }, ["skipped"]);
  } else {
    return NextResponse.json({ ok: false, error: "Үйлдэл буруу байна" }, { status: 400 });
  }

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Гүйлгээний төлөв өөрчлөгдсөн байна — хуудсаа шинэчилнэ үү" }, { status: 409 });
  }
  await logAdminAction(request, {
    actionType: "statement.transaction",
    targetId: id,
    details: { action, registrationId: updated.registrationId, amount: updated.amount, date: updated.date },
  });
  return NextResponse.json({ ok: true, transaction: updated });
}

/** The payment an interrupted approve recorded for this row, if it exists and nothing else claims it. */
async function unlinkedPaymentFor(tx: BankTransaction): Promise<string | undefined> {
  const payments = await listPaymentsForRegistrations([tx.registrationId!]);
  const linked = await linkedPaymentIds(payments.map((p) => p.id));
  const since = tx.approvedAt ? Date.parse(tx.approvedAt) - 5_000 : 0;
  return payments.find(
    (p) =>
      !linked.has(p.id) &&
      Math.abs(p.amount - Math.round(tx.amount)) < 1 &&
      p.paidAt === tx.date &&
      Date.parse(p.createdAt) >= since
  )?.id;
}
