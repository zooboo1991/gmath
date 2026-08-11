import crypto from "crypto";

/**
 * Meta Send API + webhook signature checking. Deliberately thin — the AI reply
 * itself comes from lib/ai, this only moves text in and out of Facebook.
 */

function graphVersion(): string {
  return process.env.MESSENGER_GRAPH_VERSION ?? "v21.0";
}

/**
 * Verifies `X-Hub-Signature-256` against the *raw* request body. Must be the
 * raw text, not re-serialized JSON — key order and whitespace both change the
 * HMAC. Returns false rather than throwing on a missing secret so the route
 * answers 401 instead of 500 when the app isn't configured yet.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const appSecret = process.env.MESSENGER_APP_SECRET;
  if (!appSecret || !header?.startsWith("sha256=")) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  return headerBuf.length === expectedBuf.length && crypto.timingSafeEqual(headerBuf, expectedBuf);
}

/** Sends a plain-text reply. Never throws — a send failure must not make the webhook retry. */
export async function sendMessage(psid: string, text: string): Promise<void> {
  const pageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!pageToken) {
    console.error("[messenger] MESSENGER_PAGE_ACCESS_TOKEN not set, cannot reply");
    return;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${graphVersion()}/me/messages?access_token=${encodeURIComponent(pageToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: psid },
          // RESPONSE is the tag for answering something the person just sent,
          // which is all this does — proactive sends outside the 24-hour
          // window would need a different, pre-approved tag.
          messaging_type: "RESPONSE",
          message: { text: text.slice(0, 2000) },
        }),
      }
    );
    if (!res.ok) {
      console.error(`[messenger] send failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  } catch (err) {
    console.error("[messenger] send threw:", err);
  }
}

/** Shows the typing indicator while the model is thinking, so a slow reply doesn't look broken. */
export async function sendTypingOn(psid: string): Promise<void> {
  const pageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!pageToken) return;
  try {
    await fetch(
      `https://graph.facebook.com/${graphVersion()}/me/messages?access_token=${encodeURIComponent(pageToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: psid }, sender_action: "typing_on" }),
      }
    );
  } catch {
    // Cosmetic only — never worth surfacing.
  }
}
