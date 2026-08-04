import { NextResponse } from "next/server";
import { listNotificationsForUser } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтрэнэ үү" }, { status: 401 });
  }
  const notifications = await listNotificationsForUser(user.id);
  return NextResponse.json({ ok: true, notifications });
}
