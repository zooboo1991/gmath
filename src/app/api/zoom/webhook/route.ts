import { NextResponse } from "next/server";
import crypto from "crypto";
import { findLessonMeetingByZoomId, findRegistrantByZoomId, recordJoin, recordLeave } from "@/lib/zoom/db";

type ZoomParticipant = {
  id?: string;
  participant_user_id?: string;
  user_id?: string;
  registrant_id?: string;
  join_time?: string;
  leave_time?: string;
};

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

  if (body.event === "meeting.participant_joined" || body.event === "meeting.participant_left") {
    await handleParticipantEvent(body.event, body.payload);
  }

  return NextResponse.json({ ok: true });
}

/**
 * Attributing a join/leave to a specific student only works when Zoom hands
 * back the registrant_id — which it does exactly when the participant used
 * their personal registration join_url (see /api/lessons/join). A host
 * joining from the start_url, or anyone joining the meeting's shared link
 * directly, arrives with no registrant_id and is silently skipped: there is
 * no user_id to attribute it to, and lesson_attendance.user_id is required.
 */
async function handleParticipantEvent(event: string, payload: Record<string, unknown> | undefined): Promise<void> {
  const object = payload?.object as { id?: string | number; participant?: ZoomParticipant } | undefined;
  const meetingIdRaw = object?.id;
  const participant = object?.participant;
  const registrantId = participant?.registrant_id;

  if (!meetingIdRaw || !registrantId) {
    console.log("[zoom webhook] participant event without registrant_id, skipping", event);
    return;
  }

  const meeting = await findLessonMeetingByZoomId(String(meetingIdRaw));
  const registrant = await findRegistrantByZoomId(registrantId);
  if (!meeting || !registrant) {
    console.warn("[zoom webhook] no matching lesson_meeting/registrant for", { meetingIdRaw, registrantId });
    return;
  }

  const participantUuid = participant?.id ?? participant?.participant_user_id ?? participant?.user_id;

  if (event === "meeting.participant_joined") {
    const joinedAt = participant?.join_time ? new Date(participant.join_time).toISOString() : new Date().toISOString();
    await recordJoin({ lessonMeetingId: meeting.id, userId: registrant.userId, zoomParticipantUuid: participantUuid, joinedAt });
  } else {
    const leftAt = participant?.leave_time ? new Date(participant.leave_time).toISOString() : new Date().toISOString();
    const closed = await recordLeave({ lessonMeetingId: meeting.id, userId: registrant.userId, zoomParticipantUuid: participantUuid, leftAt });
    if (!closed) {
      console.warn("[zoom webhook] leave event with no matching open attendance row", { meetingIdRaw, registrantId });
    }
  }
}
