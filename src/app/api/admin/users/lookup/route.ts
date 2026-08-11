import { NextResponse } from "next/server";
import { findUserByPhone, toPublicUser } from "@/lib/db";
import { isFullAdmin } from "@/lib/session";

const PHONE_RE = /^[0-9]{8}$/;

/** Looks up an account by phone for the admin's "add registration by phone" flow — a null user is a valid result, not a 404, since the admin can still add a phone-only registration. */
export async function GET(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const phone = new URL(request.url).searchParams.get("phone")?.trim() ?? "";
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json({ ok: false, error: "8 оронтой утасны дугаар оруулна уу" }, { status: 400 });
  }
  const user = await findUserByPhone(phone);
  return NextResponse.json({ ok: true, user: user ? toPublicUser(user) : null });
}
