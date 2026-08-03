import { NextResponse } from "next/server";
import crypto from "crypto";

function requiredSecretToken(): string {
  const token = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!token) throw new Error("ZOOM_WEBHOOK_SECRET_TOKEN орчны хувьсагч тохируулаагүй байна");
  return token;
}

/**
 * Zoom's Event Subscriptions webhook. Two distinct things happen here:
 *
 * 1. `endpoint.url_validation` — the one-time handshake Zoom sends when the
 *    endpoint URL is (re)validated in the Marketplace. Must be answered with
 *    an HMAC of the token it sends back, or "Validate the URL" fails.
 * 2. Every other event — signed with `x-zm-signature` / `x-zm-request-timestamp`,
 *    verified against the raw body before anything in it is trusted.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  let body: { event?: string; payload?: Record<string, unknown> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.event === "endpoint.url_validation") {
    const plainToken = body.payload?.plainToken;
    if (typeof plainToken !== "string") {
      return NextResponse.json({ error: "Missing plainToken" }, { status: 400 });
    }
    const encryptedToken = crypto.createHmac("sha256", requiredSecretToken()).update(plainToken).digest("hex");
    return NextResponse.json({ plainToken, encryptedToken });
  }

  const signature = request.headers.get("x-zm-signature");
  const timestamp = request.headers.get("x-zm-request-timestamp");
  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const expected =
    "v0=" +
    crypto.createHmac("sha256", requiredSecretToken()).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // TODO(attendance): meeting.participant_joined / meeting.participant_left
  // handling lands with the lesson_attendance schema — see the assessment
  // rollout's phased-commit pattern for how this file grows next.
  console.log("[zoom webhook] verified event:", body.event);
  return NextResponse.json({ ok: true });
}
