import { NextResponse } from "next/server";
import { deletePushSubscriptionByEndpoint } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/** Turns push off for this device. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const endpoint = typeof data.endpoint === "string" ? data.endpoint : "";
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  await deletePushSubscriptionByEndpoint(endpoint);
  return NextResponse.json({ ok: true });
}
