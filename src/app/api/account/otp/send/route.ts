import { NextResponse } from "next/server";
import { findUserByPhone } from "@/lib/db";
import { requestOtp } from "@/lib/otp";

const PHONE_RE = /^[0-9]{8}$/;

export async function POST(request: Request) {
  const { phone, email, purpose } = await request.json().catch(() => ({}));

  if (!PHONE_RE.test(phone?.trim() ?? "")) {
    return NextResponse.json({ ok: false, error: "8 оронтой утасны дугаар оруулна уу" }, { status: 400 });
  }
  if (purpose !== "register" && purpose !== "reset") {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const trimmedPhone = phone.trim();
  const existing = await findUserByPhone(trimmedPhone);

  if (purpose === "register") {
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Энэ дугаараар бүртгэл үүссэн байна. Нэвтэрнэ үү." },
        { status: 409 }
      );
    }
  } else {
    // reset: same generic-success-either-way behaviour as reset-password
    // itself — don't let this endpoint become an oracle for which phone
    // numbers are registered, or spend SMS balance texting a number that
    // isn't the account holder's.
    if (!existing || existing.email.trim().toLowerCase() !== (email ?? "").trim().toLowerCase()) {
      return NextResponse.json({ ok: true });
    }
  }

  try {
    const result = await requestOtp(trimmedPhone, purpose);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // No phone number here on purpose: the timestamp and purpose are enough
    // to find the row in otp_codes, and a log line is not a place for a
    // child's number.
    console.error("otp send failed", purpose, err);
    return NextResponse.json(
      { ok: false, error: "Код илгээхэд алдаа гарлаа. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}
