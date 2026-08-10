import { NextResponse } from "next/server";
import { savePushSubscription } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/** Registers this device for push — body is a browser PushSubscription.toJSON(). */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const endpoint = typeof data.endpoint === "string" ? data.endpoint : "";
  const p256dh = typeof data.keys?.p256dh === "string" ? data.keys.p256dh : "";
  const auth = typeof data.keys?.auth === "string" ? data.keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  await savePushSubscription(user.id, { endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
}
