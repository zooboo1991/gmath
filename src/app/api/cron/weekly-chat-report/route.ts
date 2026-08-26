import { NextResponse } from "next/server";
import { buildChatReport } from "@/lib/chatReport";

/**
 * The past week's chat, sorted out every Monday morning (see vercel.json).
 *
 * Same authentication as the other crons: Vercel attaches the CRON_SECRET
 * bearer token, and nothing without it gets in.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  // Monday's run covers the seven days that ended yesterday (Sunday).
  const now = new Date();
  const toDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const report = await buildChatReport({ fromDate, toDate });
  return NextResponse.json({
    ok: true,
    report: { id: report.id, fromDate, toDate, messageCount: report.messageCount },
  });
}
