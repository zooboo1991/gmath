import { NextResponse } from "next/server";
import { listWaitlist, setWaitlistStatus, type WaitlistStatus } from "@/lib/waitlist";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";

const STATUSES: WaitlistStatus[] = ["waiting", "notified", "closed"];

export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, requests: await listWaitlist() });
}

/** Moves a batch of requests along — usually to "notified" after a class opens. */
export async function PUT(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const ids = Array.isArray(data.ids) ? data.ids.filter((id: unknown) => typeof id === "string") : [];
  const status = STATUSES.includes(data.status) ? (data.status as WaitlistStatus) : undefined;

  if (ids.length === 0 || !status) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const updated = await setWaitlistStatus(ids, status);
  await logAdminAction(request, {
    actionType: "waitlist.status",
    details: { status, count: String(updated) },
  });
  return NextResponse.json({ ok: true, updated });
}
