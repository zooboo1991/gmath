import { NextResponse } from "next/server";
import { isFullAdmin } from "@/lib/session";
import { BANK_STATEMENTS_BUCKET, createSignedUrl, isStatementPath } from "@/lib/storage";
import { findStatement } from "@/lib/bankStatement/db";

/** The original uploaded file, through a one-minute signed link. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const statement = /^[0-9a-f-]{36}$/i.test(id) ? await findStatement(id) : undefined;
  if (!statement || !isStatementPath(statement.filePath)) {
    return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 404 });
  }
  const url = await createSignedUrl(BANK_STATEMENTS_BUCKET, statement.filePath, 60);
  if (!url) return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 404 });
  return NextResponse.redirect(url);
}
