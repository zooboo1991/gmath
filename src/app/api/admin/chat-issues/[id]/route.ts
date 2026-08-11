import { NextResponse } from "next/server";
import { setChatIssueStatus } from "@/lib/db";
import { isAdmin } from "@/lib/session";

/** Flip an issue between new/resolved from the admin "Чат" tab. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json().catch(() => null);
  const status = data?.status;
  if (status !== "new" && status !== "resolved") {
    return NextResponse.json({ ok: false, error: "Статус буруу байна" }, { status: 400 });
  }
  const found = await setChatIssueStatus(id, status);
  if (!found) {
    return NextResponse.json({ ok: false, error: "Гомдол олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
