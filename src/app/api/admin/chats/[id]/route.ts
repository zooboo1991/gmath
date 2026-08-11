import { NextResponse } from "next/server";
import { listChatMessagesForAdmin } from "@/lib/db";
import { isFullAdmin } from "@/lib/session";

/** Full transcript for one conversation — fetched lazily when a row is expanded. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const messages = await listChatMessagesForAdmin(id);
  return NextResponse.json({ ok: true, messages });
}
