import { NextResponse } from "next/server";
import { getAdminActor, isFullAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/adminLog";
import { approveTransaction } from "@/lib/bankStatement/approve";
import { findTransactions } from "@/lib/bankStatement/db";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_IDS = 50;
/** Stop starting new rows past this, well inside maxDuration; the client sends the rest again. */
const TIME_BUDGET_MS = 40_000;

// Each row is a few database round trips, and a pending one also a QPay call.
export const maxDuration = 60;

/**
 * «Батлах»: records every listed "ready" transfer as a payment. The ids are
 * the rows the admin was looking at — never "whatever is ready right now" —
 * so a row that turned ready after the screen loaded is not swept in unseen.
 * The client sends them in small batches; rows not reached in time come back
 * in `notProcessed`, untouched, to be sent again.
 */
export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const ids = (data as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every((v) => typeof v === "string" && UUID_RE.test(v))) {
    return NextResponse.json({ ok: false, error: "Батлах гүйлгээгээ сонгоно уу" }, { status: 400 });
  }

  const actor = await getAdminActor();
  const transactions = (await findTransactions([...new Set(ids as string[])])).sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt)
  );
  const started = Date.now();
  const outcomes = [];
  const notProcessed: string[] = [];
  for (const tx of transactions) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      notProcessed.push(tx.id);
      continue;
    }
    const outcome = await approveTransaction(tx, actor?.name);
    outcomes.push(outcome);
    if (outcome.ok) {
      await logAdminAction(request, {
        actionType: "registration.statement_payment",
        targetId: outcome.registrationId,
        details: {
          programId: outcome.programId,
          amount: outcome.amount,
          paidAt: outcome.paidAt,
          activated: outcome.activated,
          transactionId: tx.id,
          statementId: tx.statementId,
        },
      });
    }
  }

  const done = outcomes.filter((o) => o.ok);
  return NextResponse.json({
    ok: true,
    approved: done.length,
    activated: done.filter((o) => o.ok && o.activated).length,
    failed: outcomes.filter((o) => !o.ok),
    notProcessed,
    transactions: await findTransactions(transactions.map((t) => t.id)),
  });
}
