import { NextResponse } from "next/server";
import { listAllRegistrations } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const registrations = await listAllRegistrations();
  return NextResponse.json({ ok: true, registrations });
}
