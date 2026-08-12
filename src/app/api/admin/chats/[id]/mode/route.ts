import { NextResponse } from "next/server";
import { setChatConversationMode } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";

/**
 * Pauses the bot on one conversation ('admin') or hands it back ('bot').
 *
 * Audited: this changes who a visitor is talking to, and "why did the bot stop
 * answering that person" is a question worth being able to answer later.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json().catch(() => null);
  const mode = data?.mode;
  if (mode !== "bot" && mode !== "admin") {
    return NextResponse.json({ ok: false, error: "Режим буруу байна" }, { status: 400 });
  }

  const found = await setChatConversationMode(id, mode);
  if (!found) {
    return NextResponse.json({ ok: false, error: "Харилцан яриа олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: mode === "admin" ? "chat.takeover" : "chat.release",
    targetId: id,
  });
  return NextResponse.json({ ok: true, mode });
}
