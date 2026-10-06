import { NextResponse } from "next/server";
import { getAdminActor, isFullAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/adminLog";
import { uploadStatementFile } from "@/lib/storage";
import { parseKhanStatement, StatementParseError } from "@/lib/bankStatement/parse";
import { matchTransaction } from "@/lib/bankStatement/match";
import {
  createStatement,
  existingDedupeKeys,
  insertTransactions,
  listStatements,
  listTransactions,
  loadMatchData,
  setStatementNewRows,
  type NewTransaction,
} from "@/lib/bankStatement/db";

const MAX_SIZE = 5 * 1024 * 1024;
const fmt = (n: number) => `${Math.round(n).toLocaleString("en-US")}₮`;

/**
 * Every stored statement and transfer, newest first, and the registrations the
 * admin links them to (with what each still owes) — the matching screen
 * reloads all three together so balances never lag behind the rows.
 */
export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const [statements, transactions, { roster }] = await Promise.all([listStatements(), listTransactions(), loadMatchData()]);
  return NextResponse.json({ ok: true, statements, transactions, roster });
}

/**
 * Upload a Khan Bank statement (.xlsx, multipart field "file"). Stores the
 * file, keeps every incoming row not already stored from an overlapping
 * statement, and matches each new row to a registration. Nothing is recorded
 * as a payment here — that waits for «Батлах».
 */
export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const form = (request.headers.get("content-type") ?? "").includes("multipart/form-data")
    ? await request.formData().catch(() => null)
    : null;
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Хуулгын Excel файлаа сонгоно уу" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "Файл 5MB-аас ихгүй байх ёстой" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return NextResponse.json({ ok: false, error: "Зөвхөн .xlsx файл оруулна уу" }, { status: 400 });
  }

  let parsed: ReturnType<typeof parseKhanStatement>;
  try {
    parsed = parseKhanStatement(new Uint8Array(buffer));
  } catch (err) {
    const message = err instanceof StatementParseError ? err.message : "Хуулгыг уншиж чадсангүй";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  if (parsed.credits.length === 0) {
    return NextResponse.json({ ok: false, error: "Хуулгад орлогын гүйлгээ алга байна" }, { status: 400 });
  }

  let filePath: string;
  try {
    filePath = await uploadStatementFile(buffer);
  } catch (err) {
    console.error("[statements] storing the file failed", err);
    return NextResponse.json(
      { ok: false, error: "Хуулгын файлыг хадгалж чадсангүй — «bank-statements» bucket үүссэн эсэхийг шалгана уу" },
      { status: 500 }
    );
  }

  const actor = await getAdminActor();
  const statement = await createStatement({
    fileName: (file.name || "statement.xlsx").slice(0, 120),
    filePath,
    holder: parsed.holder,
    account: parsed.account,
    periodFrom: parsed.periodFrom,
    periodTo: parsed.periodTo,
    creditRows: parsed.credits.length,
    rowCreditTotal: parsed.rowCreditTotal,
    footerCreditTotal: parsed.footerCreditTotal,
    balanceGaps: parsed.balanceGaps,
    uploadedBy: actor?.name,
  });

  const known = await existingDedupeKeys(parsed.credits.map((c) => c.dedupeKey));
  const fresh = parsed.credits.filter((c) => !known.has(c.dedupeKey));
  const { ctx } = await loadMatchData(parsed.ownAccounts);
  const rows: NewTransaction[] = fresh.map((c) => {
    const m = matchTransaction(c, ctx);
    return {
      statementId: statement.id,
      dedupeKey: c.dedupeKey,
      occurredAt: c.occurredAt,
      amount: c.amount,
      description: c.description,
      counterAccount: c.counterAccount,
      balanceAfter: c.balanceAfter,
      status: m.status,
      registrationId: m.registrationId,
      matchSource: m.source,
      confidence: m.confidence,
      reason: m.reason,
      candidates: m.candidates,
      paymentId: m.paymentId ?? null,
    };
  });
  const inserted = await insertTransactions(rows);
  await setStatementNewRows(statement.id, inserted.length);

  const warnings: string[] = [];
  if (parsed.footerCreditTotal !== null && Math.abs(parsed.footerCreditTotal - parsed.rowCreditTotal) > 1) {
    warnings.push(
      `Хуулгын нийт орлого ${fmt(parsed.footerCreditTotal)}, харин мөрүүдийн нийлбэр ${fmt(parsed.rowCreditTotal)} — зарим гүйлгээ файлд гараагүй байж магадгүй.`
    );
  }
  if (parsed.balanceGaps > 0) {
    warnings.push(`Үлдэгдэл ${parsed.balanceGaps} газар тасарсан — хуулга бүрэн бус байж магадгүй.`);
  }

  await logAdminAction(request, {
    actionType: "statement.upload",
    targetId: statement.id,
    details: {
      fileName: statement.fileName,
      periodFrom: parsed.periodFrom,
      periodTo: parsed.periodTo,
      creditRows: parsed.credits.length,
      newRows: inserted.length,
    },
  });

  return NextResponse.json({
    ok: true,
    statement: { ...statement, newRows: inserted.length },
    inserted: inserted.length,
    duplicates: parsed.credits.length - inserted.length,
    warnings,
  });
}
