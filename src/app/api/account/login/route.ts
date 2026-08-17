import { NextResponse } from "next/server";
import { toPublicUser, verifyUserPassword } from "@/lib/db";
import { setSessionUser } from "@/lib/session";
import { clearRateLimit, peekRateLimit, recordFailedAttempt } from "@/lib/rateLimit";

const PHONE_RE = /^[0-9]{8}$/;

export async function POST(request: Request) {
  // Not JSON? Treat it as an empty body and let the checks below answer
  // 400, the way every other bad input on this route is answered.
  const { phone, password } = await request.json().catch(() => ({}));

  if (!PHONE_RE.test(phone?.trim() ?? "") || !password) {
    return NextResponse.json(
      { ok: false, error: "Утасны дугаар, нууц үгээ бөглөнө үү" },
      { status: 400 }
    );
  }

  // Peek, don't count: only a wrong password is an attempt worth limiting.
  // Checking before the password is verified still means a locked-out number
  // never reaches the (deliberately slow) hash comparison.
  const rateKey = `login:${phone.trim()}`;
  const rate = await peekRateLimit(rateKey, 8, 5 * 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Оролдлого хэт олон удаа амжилтгүй боллоо. Хэдэн минутын дараа дахин оролдоно уу." },
      { status: 429 }
    );
  }

  const user = await verifyUserPassword(phone.trim(), password);
  if (!user) {
    await recordFailedAttempt(rateKey, 5 * 60);
    return NextResponse.json(
      { ok: false, error: "Утасны дугаар эсвэл нууц үг буруу байна" },
      { status: 401 }
    );
  }

  // Signing in proves the account is the owner's; the earlier misses are no
  // longer evidence of an attack, so the slate is wiped.
  await clearRateLimit(rateKey);
  await setSessionUser(user.id);
  return NextResponse.json({ ok: true, user: toPublicUser(user) });
}
