import { NextResponse } from "next/server";
import { findUserByPhone, toPublicUser, updateUserPassword } from "@/lib/db";
import { consumeVerifiedOtp } from "@/lib/otp";
import { setSessionUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rateLimit";
import { isTooLong, MAX_LEN } from "@/lib/validate";

const PHONE_RE = /^[0-9]{8}$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
const GENERIC_MISMATCH_ERROR = "Утасны дугаар, и-мэйл хаяг таарахгүй байна";

export async function POST(request: Request) {
  const { phone, email, newPassword } = await request.json().catch(() => ({}));

  if (!PHONE_RE.test(phone?.trim() ?? "")) {
    return NextResponse.json({ ok: false, error: "8 оронтой утасны дугаар оруулна уу" }, { status: 400 });
  }
  if (!email?.trim()) {
    return NextResponse.json({ ok: false, error: "Бүртгүүлсэн и-мэйл хаягаа оруулна уу" }, { status: 400 });
  }
  if (!PASSWORD_RE.test(newPassword ?? "") || isTooLong(newPassword, MAX_LEN.password)) {
    return NextResponse.json(
      { ok: false, error: "Нууц үг том, жижиг үсэг, тоо орсон, дор хаяж 6 тэмдэгт байна" },
      { status: 400 }
    );
  }

  const rate = await checkRateLimit(`reset-password:${phone.trim()}`, 5, 15 * 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Оролдлого хэт олон удаа амжилтгүй боллоо. Хэдэн минутын дараа дахин оролдоно уу." },
      { status: 429 }
    );
  }

  const existing = await findUserByPhone(phone.trim());
  if (!existing || existing.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    // Same message either way — don't reveal whether the phone number itself is registered.
    return NextResponse.json({ ok: false, error: GENERIC_MISMATCH_ERROR }, { status: 404 });
  }

  // The actual enforcement point for phone OTP — see the matching comment
  // in /api/account/register. Closes the account-takeover gap this route
  // used to have with only phone+email checked.
  if (!(await consumeVerifiedOtp(phone.trim(), "reset"))) {
    return NextResponse.json(
      { ok: false, error: "Утасны дугаараа эхлээд баталгаажуулна уу" },
      { status: 400 }
    );
  }

  const user = await updateUserPassword(existing.id, newPassword);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Алдаа гарлаа" }, { status: 500 });
  }

  await setSessionUser(user.id);
  return NextResponse.json({ ok: true, user: toPublicUser(user) });
}
