import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { zoomFetch } from "@/lib/zoom/client";

// TEMP verification route — confirms allow_multiple_devices actually lands
// on a real created meeting. Delete after use.
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const meetingId = new URL(request.url).searchParams.get("id");
  if (!meetingId) return NextResponse.json({ ok: false, error: "id?" }, { status: 400 });

  const res = await zoomFetch(`/meetings/${meetingId}`);
  const json = await res.json();
  return NextResponse.json({ status: res.status, settings: json.settings });
}
