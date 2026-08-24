import { NextResponse } from "next/server";
import { resolveAdminLogin, setAdminSession } from "@/lib/session";
import { verifyAdminLogin } from "@/lib/adminUsers";
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

  const name = typeof username === "string" ? username : "";
  const pass = typeof password === "string" ? password : "";

  // The environment password first: it is the owner's key and needs no
  // database, so it keeps working even if admin_users is unreachable.
  const envRole = resolveAdminLogin(name, pass);
  if (envRole) {
    await setAdminSession(envRole);
    return NextResponse.json({ ok: true, role: envRole });
  }

  // Then the named accounts — teachers, and anyone else given a way in.
  const account = await verifyAdminLogin(name, pass).catch(() => null);
  if (account) {
    await setAdminSession(account.role, { id: account.id, name: account.name });
    return NextResponse.json({ ok: true, role: account.role, name: account.name });
  }

  // One message for every failure — a wrong name, a wrong password, a
  // deactivated account. Naming which half failed would tell an attacker
  // which usernames exist.
  return NextResponse.json({ ok: false, error: "Нэвтрэх нэр эсвэл нууц үг буруу байна" }, { status: 401 });
}
