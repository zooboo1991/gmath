import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findChatConversation, listChatMessagesSince } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const VISITOR_COOKIE = "vid";

/**
 * What the visitor's widget polls while it's open: anything added to the
 * thread since the message it already has, plus who is answering right now.
 *
 * This is how an admin's reply reaches the page — there is no socket, and a
 * poll against our own database costs nothing like an AI call does, so the
 * limit here is generous compared with /api/chat's.
 *
 * Reading someone else's transcript is prevented the same way resuming one is:
 * findChatConversation matches on the visitor cookie as well as the id, so a
 * guessed conversation id returns 404.
 */
export async function GET(request: Request) {
  const { allowed } = await checkRateLimit(`chatpoll:${getClientIp(request.headers)}`, 120, 60);
  if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");
  const after = url.searchParams.get("after") ?? undefined;
  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversationId дутуу" }, { status: 400 });
  }

  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value;
  if (!visitorId) {
    return NextResponse.json({ ok: false, error: "Харилцан ярианы хандалт байхгүй" }, { status: 404 });
  }

  const conversation = await findChatConversation(conversationId, visitorId);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "Харилцан ярианы хандалт байхгүй" }, { status: 404 });
  }

  const messages = await listChatMessagesSince(conversationId, after);
  return NextResponse.json({ ok: true, mode: conversation.mode, messages });
}
