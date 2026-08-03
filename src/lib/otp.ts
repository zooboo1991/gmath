import crypto from "crypto";
import { getSupabase } from "./supabase";
import { hashPassword, verifyPassword } from "./password";
import { checkRateLimit } from "./rateLimit";
import { sendSms } from "./sms/skytel";

/**
 * SMS OTP for phone verification — registration (the phone actually
 * belongs to whoever is signing up) and password reset (closing the
 * account-takeover gap the interim phone+email check in reset-password
 * flagged: see that route's comment). Codes are 4 digits, valid 5 minutes
 * to enter; once verified, the register/reset-password routes have 15
 * minutes to actually consume it before it goes stale again.
 */

export type OtpPurpose = "register" | "reset";

type OtpResult = { ok: true } | { ok: false; error: string; status: number };

const CODE_TTL_MS = 5 * 60 * 1000;
const VERIFIED_WINDOW_MS = 15 * 60 * 1000;

function generateCode(): string {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

/**
 * Sends a fresh code, throttled two ways: at most one every 60s (resend
 * cooldown) and at most 5 per hour per phone+purpose (abuse cap — SMS
 * costs real money off a prepaid balance).
 */
export async function requestOtp(phone: string, purpose: OtpPurpose): Promise<OtpResult> {
  const cooldown = await checkRateLimit(`otp-cooldown:${purpose}:${phone}`, 1, 60);
  if (!cooldown.allowed) {
    return { ok: false, error: "Түр хүлээгээд дахин код авна уу (1 минут)", status: 429 };
  }
  const hourly = await checkRateLimit(`otp-hourly:${purpose}:${phone}`, 5, 60 * 60);
  if (!hourly.allowed) {
    return { ok: false, error: "Хэт олон удаа код хүссэн байна. Дараа дахин оролдоно уу.", status: 429 };
  }

  const code = generateCode();
  const { hash, salt } = hashPassword(code);
  const { error } = await getSupabase()
    .from("otp_codes")
    .insert({
      phone,
      purpose,
      code_hash: hash,
      code_salt: salt,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
  if (error) throw error;

  // Latin transliteration, not Cyrillic — confirmed live that Skytel's
  // Web2SMS gateway garbles Cyrillic text into unreadable characters.
  await sendSms(phone, `Ganbat bagshiin surgaltiin 1 udaagiin nuuts ug: ${code}`);
  return { ok: true };
}

/** Marks the latest unverified code for this phone+purpose as verified, if the code matches and hasn't expired. */
export async function verifyOtp(phone: string, purpose: OtpPurpose, code: string): Promise<OtpResult> {
  const attempt = await checkRateLimit(`otp-verify:${purpose}:${phone}`, 8, 5 * 60);
  if (!attempt.allowed) {
    return { ok: false, error: "Хэт олон удаа буруу оролдлоо. Дараа дахин код авна уу.", status: 429 };
  }

  const { data, error } = await getSupabase()
    .from("otp_codes")
    .select("id, code_hash, code_salt, expires_at")
    .eq("phone", phone)
    .eq("purpose", purpose)
    .is("verified_at", null)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (!data || new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Код хүчингүй болсон. Дахин код авна уу.", status: 400 };
  }
  if (!verifyPassword(code, data.code_hash, data.code_salt)) {
    return { ok: false, error: "Код буруу байна", status: 400 };
  }

  const { error: updateError } = await getSupabase()
    .from("otp_codes")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", data.id);
  if (updateError) throw updateError;

  return { ok: true };
}

/**
 * Called by register/reset-password right before they take effect — the
 * actual enforcement point, since a client could otherwise call those
 * routes directly and skip the OTP screen entirely. Consumes the verified
 * code so it can't be replayed for a second registration/reset.
 */
export async function consumeVerifiedOtp(phone: string, purpose: OtpPurpose): Promise<boolean> {
  const since = new Date(Date.now() - VERIFIED_WINDOW_MS).toISOString();
  const { data, error } = await getSupabase()
    .from("otp_codes")
    .select("id")
    .eq("phone", phone)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .not("verified_at", "is", null)
    .gte("verified_at", since)
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;

  const { error: updateError } = await getSupabase()
    .from("otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", data.id);
  if (updateError) throw updateError;
  return true;
}
