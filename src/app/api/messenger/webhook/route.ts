import { NextResponse } from "next/server";
import {
  createChatConversation,
  findLatestChatConversation,
  insertChatMessage,
  listChatMessages,
  toModelMessages,
} from "@/lib/db";
import { extractIssue, recordChatIssue } from "@/lib/ai/issues";
import { routeChat } from "@/lib/ai/router";
import { buildSystemPrompt } from "@/lib/ai/systemPrompt";
import { sendMessage, sendTypingOn, verifySignature } from "@/lib/messenger/client";
import { consumeLinkToken, findUserIdByPsid, LINK_CODE_RE, unlinkPsid } from "@/lib/messenger/db";
import { checkRateLimit } from "@/lib/rateLimit";

/** Typed just enough for what's handled — Meta's payload has far more fields. */
type MessagingEvent = {
  sender?: { id?: string };
  message?: { text?: string; is_echo?: boolean };
  postback?: { referral?: { ref?: string } };
  referral?: { ref?: string };
};

const UNLINK_COMMANDS = ["холболтыг салга", "холболт салга", "холболтыг цуцла", "unlink"];

/**
 * Meta's webhook verification handshake. Facebook GETs this URL with the
 * verify token from the app's Messenger settings and expects its own
 * hub.challenge echoed back as plain text — anything else and "Verify and
 * save" fails in the dashboard.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.MESSENGER_VERIFY_TOKEN;
  if (!expected) {
    console.error("[messenger] MESSENGER_VERIFY_TOKEN not set");
    return new Response("Not configured", { status: 500 });
  }
  if (mode !== "subscribe" || token !== expected || !challenge) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  // Raw text, and verified before parsing: the HMAC covers the exact bytes
  // Facebook sent, so re-serializing the JSON would change it.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: { object?: string; entry?: { messaging?: MessagingEvent[] }[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "page") return NextResponse.json({ ok: true });

  // Answer Facebook first and do the work inline afterwards: Meta retries on
  // anything slow or non-200, and a retried AI call is a double charge. Errors
  // are logged, never surfaced — there is no useful 4xx to give a webhook.
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      try {
        await handleEvent(event);
      } catch (err) {
        console.error("[messenger] event handling failed:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleEvent(event: MessagingEvent): Promise<void> {
  const psid = event.sender?.id;
  if (!psid) return;

  // Echoes are the page's own outgoing messages coming back; replying to them
  // would loop forever.
  if (event.message?.is_echo) return;

  // A ref arrives on the very first message from an m.me/<page>?ref=<token>
  // link (referral) or from the Get Started button (postback.referral) — this
  // is the whole account-linking handshake.
  const ref = event.referral?.ref ?? event.postback?.referral?.ref;
  if (ref) {
    const linkedUserId = await consumeLinkToken(ref, psid);
    await sendMessage(
      psid,
      linkedUserId
        ? "Таны gmath.mn эрх холбогдлоо. Одооноос хичээлийн хуваарь, Facebook групп, Zoom холбоосоо надаас асууж болно."
        : "Холболтын холбоос хүчингүй болсон эсвэл аль хэдийн хэрэглэгдсэн байна. gmath.mn/profile хуудаснаас шинээр холбоно уу."
    );
    // A referral often arrives with no message text of its own; if it did
    // carry one, fall through and answer it too.
    if (!event.message?.text) return;
  }

  const text = event.message?.text?.trim();
  // Delivery receipts, read receipts, reactions and attachments all land here
  // with no text — nothing to answer.
  if (!text) return;

  // The linking code typed as a message — the reliable path, since m.me?ref=
  // only delivers its ref inside the mobile Messenger app. Shape-checked first
  // so this costs a DB lookup only for something that actually looks like a
  // code; anything that looks like one but isn't valid falls through to a
  // normal answer rather than dead-ending.
  if (LINK_CODE_RE.test(text.toUpperCase())) {
    const linkedUserId = await consumeLinkToken(text.toUpperCase(), psid);
    if (linkedUserId) {
      await sendMessage(
        psid,
        "Таны gmath.mn эрх холбогдлоо. Одооноос хичээлийн хуваарь, Facebook групп, Zoom холбоосоо надаас асууж болно."
      );
      return;
    }
  }

  if (UNLINK_COMMANDS.some((cmd) => text.toLowerCase().includes(cmd))) {
    const had = await unlinkPsid(psid);
    await sendMessage(
      psid,
      had
        ? "Холболтыг цуцаллаа. Хувийн мэдээллээ дахин асуухын тулд gmath.mn/profile хуудаснаас дахин холбоно уу."
        : "Таны Facebook эрх ямар ч gmath.mn бүртгэлтэй холбогдоогүй байна."
    );
    return;
  }

  // Per-PSID, since each reply is a paid AI call. Generous enough for a real
  // conversation, tight enough that one person can't run up a bill.
  const { allowed } = await checkRateLimit(`messenger:${psid}`, 15, 60);
  if (!allowed) {
    await sendMessage(psid, "Хэт олон мессеж илгээлээ. Хэсэг хүлээгээд дахин оролдоно уу.");
    return;
  }

  const userId = await findUserIdByPsid(psid);

  // PSID is this person's stable identity for the page, so it plays the same
  // role the `vid` cookie does on the website.
  let conversationId = await findLatestChatConversation(psid);
  conversationId ??= await createChatConversation(psid, userId, "messenger");

  const history = await listChatMessages(conversationId);
  await insertChatMessage(conversationId, "user", text);

  await sendTypingOn(psid);

  const system = await buildSystemPrompt({ userId, channel: "messenger" });
  const result = await routeChat({
    system,
    // toModelMessages: the transcript can also hold admin replies, and the
    // provider accepts only user/assistant.
    messages: toModelMessages([...history, { role: "user", content: text }]),
  });

  // Same marker handling as the website route: strip before storing/sending,
  // record the issue in the background.
  const { cleanText, flagged } = extractIssue(result.text);
  if (flagged) {
    recordChatIssue({ conversationId, userId, channel: "messenger", userMessage: text }).catch((err) =>
      console.error("[messenger] issue recording failed:", err)
    );
  }

  await insertChatMessage(conversationId, "assistant", cleanText, {
    tokensUsed: result.tokensUsed.input + result.tokensUsed.output,
    modelUsed: result.model,
  });
  await sendMessage(psid, cleanText);
}
