import { NextResponse } from "next/server";
import { toPublicUser, verifyUserPassword } from "@/lib/db";
import { setSessionUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rateLimit";

const PHONE_RE = /^[0-9]{8}$/;

export async function POST(request: Request) {
  const { phone, password } = await request.json();

  if (!PHONE_RE.test(phone?.trim() ?? "") || !password) {
    return NextResponse.json(
      { ok: false, error: "Утасны дугаар, нууц үгээ бөглөнө үү" },
      { status: 400 }
    );
  }

  const rate = await checkRateLimit(`login:${phone.trim()}`, 8, 5 * 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Оролдлого хэт олон удаа амжилтгүй боллоо. Хэдэн минутын дараа дахин оролдоно уу." },
      { status: 429 }
    );
  }

  const user = await verifyUserPassword(phone.trim(), password);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Утасны дугаар эсвэл нууц үг буруу байна" },
      { status: 401 }
    );
  }

  await setSessionUser(user.id);
  return NextResponse.json({ ok: true, user: toPublicUser(user) });
}
