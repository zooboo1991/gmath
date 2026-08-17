import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/otp";

const PHONE_RE = /^[0-9]{8}$/;
const CODE_RE = /^[0-9]{4}$/;

export async function POST(request: Request) {
  const { phone, purpose, code } = await request.json().catch(() => ({}));

  if (
    !PHONE_RE.test(phone?.trim() ?? "") ||
    (purpose !== "register" && purpose !== "reset") ||
    !CODE_RE.test(code ?? "")
  ) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const result = await verifyOtp(phone.trim(), purpose, code);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
