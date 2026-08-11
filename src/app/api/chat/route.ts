import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import {
  createChatConversation,
  findChatConversation,
  insertChatMessage,
  listChatMessages,
} from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { routeChat } from "@/lib/ai/router";
import { buildSystemPrompt } from "@/lib/ai/systemPrompt";
import { isTooLong, MAX_LEN } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Same cookie the pageview tracker mints (src/app/api/track/route.ts) — reused
// rather than minting a second anonymous id for the same browser.
const VISITOR_COOKIE = "vid";

export async function POST(request: Request) {
  // An AI call costs real money per message, so this is throttled much harder
  // than /api/track's 120/min: 15 messages a minute is well past what a human
  // types and cheap enough that a stuck client can't run up a bill.
  const { allowed } = await checkRateLimit(`chat:${getClientIp(request.headers)}`, 15, 60);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Хэт олон мессеж илгээлээ. Хэсэг хүлээгээд дахин оролдоно уу." }, { status: 429 });
  }

  const data = await request.json().catch(() => null);
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "Мессеж хоосон байна" }, { status: 400 });
  }
  if (isTooLong(message, MAX_LEN.chatMessage)) {
    return NextResponse.json({ ok: false, error: "Мессеж хэт урт байна" }, { status: 400 });
  }

  const store = await cookies();
  let visitorId = store.get(VISITOR_COOKIE)?.value;
  if (!visitorId) {
    visitorId = randomUUID();
    store.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const sessionUser = await getSessionUser();

  let conversationId: string | undefined;
  if (typeof data?.conversationId === "string") {
    const existing = await findChatConversation(data.conversationId, visitorId);
    conversationId = existing?.id;
  }
  conversationId ??= await createChatConversation(visitorId, sessionUser?.id);

  const history = await listChatMessages(conversationId);
  await insertChatMessage(conversationId, "user", message);

  try {
    const system = await buildSystemPrompt(sessionUser?.id);
    const result = await routeChat({ system, messages: [...history, { role: "user", content: message }] });

    await insertChatMessage(conversationId, "assistant", result.text, {
      tokensUsed: result.tokensUsed.input + result.tokensUsed.output,
      modelUsed: result.model,
    });

    return NextResponse.json({ ok: true, conversationId, reply: result.text });
  } catch (err) {
    // The user's message is already persisted above, so a provider outage
    // leaves a recoverable transcript rather than losing what they typed.
    console.error("[chat] reply failed:", err);
    return NextResponse.json(
      { ok: false, conversationId, error: "Одоогоор хариулж чадсангүй. Хэсэг хүлээгээд дахин оролдоно уу." },
      { status: 503 }
    );
  }
}
