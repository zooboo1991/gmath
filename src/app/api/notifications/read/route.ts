import { NextResponse } from "next/server";
import { markNotificationsRead } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтрэнэ үү" }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const ids = Array.isArray(data.ids) ? data.ids.filter((id: unknown) => typeof id === "string") : [];
  await markNotificationsRead(ids, user.id);
  return NextResponse.json({ ok: true });
}
