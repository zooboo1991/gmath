import { NextResponse } from "next/server";
import { listAdminLogs } from "@/lib/adminLog";
import { isAdmin } from "@/lib/session";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const logs = await listAdminLogs();
  return NextResponse.json({ ok: true, logs });
}
