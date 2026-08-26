import { NextResponse } from "next/server";
import { buildChatReport, listChatReports } from "@/lib/chatReport";
import { logAdminAction } from "@/lib/adminLog";
import { getAdminActor, isFullAdmin } from "@/lib/session";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, reports: await listChatReports() });
}

/** Builds one report for the chosen range. Costs a model call, so it is never automatic here. */
export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const fromDate = typeof data.fromDate === "string" ? data.fromDate : "";
  const toDate = typeof data.toDate === "string" ? data.toDate : "";
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate) || fromDate > toDate) {
    return NextResponse.json({ ok: false, error: "Огноо буруу байна" }, { status: 400 });
  }

  const actor = await getAdminActor();
  const report = await buildChatReport({ fromDate, toDate, createdBy: actor?.name });
  await logAdminAction(request, {
    actionType: "chat_report.create",
    targetId: report.id,
    details: { fromDate, toDate, messages: String(report.messageCount) },
  });
  return NextResponse.json({ ok: true, report });
}
