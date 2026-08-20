import type { ChatChannel } from "../db";
import { createChatIssue, createNotification } from "../db";
import { getSupabase } from "../supabase";

/**
 * Complaint capture. The system prompt (systemPrompt.ts) tells the model to
 * append a marker line when a message reports a service problem — the reply
 * call we're already paying for doubles as the classifier, instead of a
 * keyword list (brittle across Mongolian phrasings) or a second AI call
 * (doubles the cost of every message).
 *
 * The marker must never reach the visitor or the stored transcript, so both
 * chat routes run their reply through extractIssue() before persisting or
 * sending anything.
 */

export const ISSUE_MARKER = "<<ГОМДОЛ>>";

// Anchored to the end: that's where the prompt says to put it, and a
// mid-text occurrence (e.g. the model quoting the instruction) shouldn't
// silently vanish from the reply while also not flagging.
const ISSUE_MARKER_RE = /\n?\s*<<ГОМДОЛ>>\s*$/;

export function extractIssue(replyText: string): { cleanText: string; flagged: boolean } {
  if (!ISSUE_MARKER_RE.test(replyText)) return { cleanText: replyText, flagged: false };
  return { cleanText: replyText.replace(ISSUE_MARKER_RE, "").trimEnd(), flagged: true };
}

/**
 * Records the issue and alerts the admins. Callers fire-and-forget this —
 * the visitor already has their reply by the time it runs, and a bookkeeping
 * failure must never surface in the conversation.
 *
 * Alert recipients come from CHAT_ALERT_PHONES (comma-separated phone
 * numbers resolved against the users table) because "admin" isn't an account
 * type here — the admins receive pushes through their own student accounts,
 * the same transport every other notification uses. Unset means record-only.
 */
export async function recordChatIssue(input: {
  conversationId: string;
  userId?: string;
  channel: ChatChannel;
  userMessage: string;
}): Promise<void> {
  await createChatIssue({
    conversationId: input.conversationId,
    userId: input.userId,
    channel: input.channel,
    message: input.userMessage,
  });

  const phones = (process.env.CHAT_ALERT_PHONES ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (phones.length === 0) return;

  const { data, error } = await getSupabase().from("users").select("id").in("phone", phones);
  if (error) throw error;
  const userIds = (data as { id: string }[]).map((u) => u.id);
  if (userIds.length === 0) return;

  await createNotification({
    title: "Чатаас гомдол ирлээ",
    body: input.userMessage.slice(0, 150),
    targetType: "users",
    userIds,
    channel: "site",
    link: "/admin/chat",
  });
}
