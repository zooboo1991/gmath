import { createNotification } from "./db";
import { getSupabase } from "./supabase";

/**
 * Tells the admins a visitor is waiting on a human reply.
 *
 * Only fires while a conversation is in admin mode, and only on the first
 * message since the admin last answered (the caller decides that) — a takeover
 * where nobody is watching the panel would otherwise strand the visitor in
 * silence, and a push per keystroke-burst would be unusable.
 *
 * Recipients come from CHAT_ALERT_PHONES, the same list the complaint alerts
 * use: "admin" isn't an account type here, so the admins get notified through
 * their own student accounts.
 */
export async function notifyAdminsOfWaitingVisitor(input: {
  conversationId: string;
  message: string;
}): Promise<void> {
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
    title: "Чатад хэрэглэгч хариу хүлээж байна",
    body: input.message.slice(0, 150),
    targetType: "users",
    userIds,
    channel: "site",
    pushUrl: "/admin/chat",
  });
}
