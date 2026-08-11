import { NextResponse } from "next/server";
import { listAdminLogs } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";

export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const logs = await listAdminLogs();
  return NextResponse.json({ ok: true, logs });
}
