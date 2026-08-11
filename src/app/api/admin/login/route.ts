import { NextResponse } from "next/server";
import { resolveAdminLogin, setAdminSession } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  // The one admin password is shared and never rotated per-login, so an
  // unthrottled endpoint is a straight brute-force target — same limit as
  // account login (8 attempts / 5 min), keyed by IP since there's no
  // per-admin username to key by.
  const rate = await checkRateLimit(`admin-login:${getClientIp(request.headers)}`, 8, 5 * 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Оролдлого хэт олон удаа амжилтгүй боллоо. Хэдэн минутын дараа дахин оролдоно уу." },
      { status: 429 }
    );
  }

  const { username, password } = await request.json();

  // One message for both a wrong name and a wrong password: naming which half
  // failed would tell an attacker which usernames exist.
  const role = resolveAdminLogin(typeof username === "string" ? username : "", password ?? "");
  if (!role) {
    return NextResponse.json({ ok: false, error: "Нэвтрэх нэр эсвэл нууц үг буруу байна" }, { status: 401 });
  }

  await setAdminSession(role);
  return NextResponse.json({ ok: true, role });
}
