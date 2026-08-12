import { NextResponse } from "next/server";
import { insertChatMessage, listChatMessagesForAdmin, setChatConversationMode } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

/**
 * Sends a human reply into a visitor's chat.
 *
 * Sending also takes the conversation over if it wasn't already: an admin who
 * types an answer has, in every sense that matters, taken over — requiring a
 * separate button press first would just be a way to let the bot reply on top
 * of them.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json().catch(() => null);
  const content = typeof data?.content === "string" ? data.content.trim() : "";
  if (!content) {
    return NextResponse.json({ ok: false, error: "Мессеж хоосон байна" }, { status: 400 });
  }
  if (isTooLong(content, MAX_LEN.chatMessage)) {
    return NextResponse.json({ ok: false, error: "Мессеж хэт урт байна" }, { status: 400 });
  }

  const found = await setChatConversationMode(id, "admin");
  if (!found) {
    return NextResponse.json({ ok: false, error: "Харилцан яриа олдсонгүй" }, { status: 404 });
  }

  await insertChatMessage(id, "admin", content);
  await logAdminAction(request, { actionType: "chat.reply", targetId: id });

  // The whole transcript back, so the panel doesn't need a second round trip
  // to show what it just sent in order.
  return NextResponse.json({ ok: true, messages: await listChatMessagesForAdmin(id) });
}
