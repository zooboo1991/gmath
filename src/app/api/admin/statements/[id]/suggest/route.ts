import { NextResponse } from "next/server";
import { isFullAdmin } from "@/lib/session";
import { AI_BATCH, suggestMatches } from "@/lib/bankStatement/ai";
import { findStatement, listTransactions, loadMatchData, updateTransaction } from "@/lib/bankStatement/db";

// One model call over a batch of transfers can take a while.
export const maxDuration = 60;

/**
 * Asks the AI to place one batch of the statement's transfers that the rules
 * left without any suggestion. Results stay in review for the admin to accept.
 *
 * Rows the AI has looked at are marked (match_source "ai") whether it placed
 * them or not, so each call moves on to the next batch; `remaining` tells the
 * client whether to call again. When the AI cannot be reached nothing is
 * marked and `aiUnavailable` says so.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const statement = /^[0-9a-f-]{36}$/i.test(id) ? await findStatement(id) : undefined;
  if (!statement) {
    return NextResponse.json({ ok: false, error: "Хуулга олдсонгүй" }, { status: 404 });
  }

  const open = (await listTransactions({ statementId: id })).filter(
    (t) => t.status === "review" && !t.registrationId && t.matchSource !== "qpay" && t.matchSource !== "ai"
  );
  if (open.length === 0) {
    return NextResponse.json({ ok: true, suggested: 0, offered: 0, remaining: 0, transactions: [] });
  }

  const batch = open.slice(0, AI_BATCH);
  const { roster } = await loadMatchData();
  const result = await suggestMatches(batch, roster);
  if (!result.ok) {
    return NextResponse.json({ ok: true, aiUnavailable: true, suggested: 0, offered: 0, remaining: open.length, transactions: [] });
  }

  const byTx = new Map(result.suggestions.map((s) => [s.transactionId, s]));
  const updated = [];
  for (const tx of batch) {
    const s = byTx.get(tx.id);
    const row = s
      ? await updateTransaction(
          tx.id,
          { registration_id: s.registrationId, match_source: "ai", confidence: s.confidence, reason: `AI: ${s.reason}` },
          ["review"]
        )
      : await updateTransaction(
          tx.id,
          { match_source: "ai", reason: `${tx.reason ? `${tx.reason} · ` : ""}AI ч олсонгүй` },
          ["review"]
        );
    if (row) updated.push(row);
  }
  return NextResponse.json({
    ok: true,
    suggested: result.suggestions.length,
    offered: batch.length,
    remaining: open.length - batch.length,
    transactions: updated,
  });
}
