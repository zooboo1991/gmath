import { NextResponse } from "next/server";
import { getAnalyticsStatsForRange } from "@/lib/db";
import { isAdmin } from "@/lib/session";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Analytics scoped to an admin-picked date range — see the Хандалт tab's filter bar. */
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json({ ok: false, error: "Огноо буруу байна" }, { status: 400 });
  }

  const stats = await getAnalyticsStatsForRange(from, to);
  return NextResponse.json({ ok: true, stats });
}
