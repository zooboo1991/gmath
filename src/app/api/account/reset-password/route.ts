import { NextResponse } from "next/server";
import { findUserByPhone, toPublicUser, updateUserPassword } from "@/lib/db";
import { setSessionUser } from "@/lib/session";

/**
 * Placeholder reset flow — a real product would text/email a one-time code
 * before allowing this. Here, knowing the phone number is enough, which is
 * fine for a demo but not for anything real.
 */

const PHONE_RE = /^[0-9]{8}$/;

export async function POST(request: Request) {
  const { phone, newPassword } = await request.json();

  if (!PHONE_RE.test(phone?.trim() ?? "")) {
    return NextResponse.json({ ok: false, error: "8 оронтой утасны дугаар оруулна уу" }, { status: 400 });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return NextResponse.json({ ok: false, error: "Нууц үг дор хаяж 6 тэмдэгт байна" }, { status: 400 });
  }

  const existing = await findUserByPhone(phone.trim());
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Энэ дугаараар бүртгэл олдсонгүй" },
      { status: 404 }
    );
  }

  const user = await updateUserPassword(existing.id, newPassword);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Алдаа гарлаа" }, { status: 500 });
  }

  await setSessionUser(user.id);
  return NextResponse.json({ ok: true, user: toPublicUser(user) });
}
