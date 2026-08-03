/**
 * Skytel's Web2SMS "Message API" (web2sms.skytel.mn dashboard -> Мессэж
 * API). A single GET request with the token, recipient, and message as
 * query params — no request signing, no callback.
 *
 * The dashboard only publishes an http:// URL, not https:// — a plaintext
 * request, unlike everything else this app talks to. There is no
 * alternative endpoint to switch to; this is what Skytel provides.
 */

const BASE_URL = "http://web2sms.skytel.mn/apiSend";

function requiredToken(): string {
  const token = process.env.SKYTEL_WEB2SMS_TOKEN;
  if (!token) throw new Error("SKYTEL_WEB2SMS_TOKEN орчны хувьсагч тохируулаагүй байна");
  return token;
}

export async function sendSms(phone: string, message: string): Promise<void> {
  const url = new URL(BASE_URL);
  url.searchParams.set("token", requiredToken());
  url.searchParams.set("sendto", phone);
  url.searchParams.set("message", message);

  const res = await fetch(url.toString());
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`SMS илгээхэд алдаа гарлаа: ${res.status} ${body.slice(0, 300)}`);
  }
  // Skytel's success/failure body format for this endpoint hasn't been
  // confirmed against a real send — logged so the first live send can
  // reveal it, until sendSms is tightened to check for an error indicator
  // in the body rather than trusting any HTTP 200.
  console.log("[skytel] send response:", body.slice(0, 300));
}
