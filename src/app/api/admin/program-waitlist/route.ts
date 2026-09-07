import { NextResponse } from "next/server";
import { isFullAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/adminLog";
import {
  setProgramWaitlistStatus,
  type ProgramWaitlistStatus,
} from "@/lib/programWaitlist";

const STATUSES: ProgramWaitlistStatus[] = ["waiting", "notified", "closed"];

/** Дараалал дахь хүний төлөв солих: холбогдсон / хаасан. */
export async function PUT(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const id = typeof data.id === "string" ? data.id : "";
  const status = STATUSES.includes(data.status) ? (data.status as ProgramWaitlistStatus) : undefined;
  if (!id || !status) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const entry = await setProgramWaitlistStatus(id, status);
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Олдсонгүй" }, { status: 404 });
  }
  await logAdminAction(request, {
    actionType: "program-waitlist.status",
    details: { program: entry.programLabel, status },
  });
  return NextResponse.json({ ok: true, entry });
}
