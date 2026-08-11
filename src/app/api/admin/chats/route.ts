import { NextResponse } from "next/server";
import { listChatConversationsForAdmin, listChatIssues } from "@/lib/db";
import { isAdmin } from "@/lib/session";

/** One fetch for the whole admin "Чат" tab: conversations and the issue log together. */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const [conversations, issues] = await Promise.all([listChatConversationsForAdmin(), listChatIssues()]);
  return NextResponse.json({ ok: true, conversations, issues });
}
