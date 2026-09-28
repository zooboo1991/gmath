import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { setMeetingOutcome, type MeetingStatus } from "@/lib/parentMeetingDb";
import { isTooLong, MAX_LEN } from "@/lib/validate";

/** Ирсэн / ирээгүй гэж тэмдэглэх, багшийн тэмдэглэл үлдээх. */
const STATUSES: MeetingStatus[] = ["booked", "came", "missed", "cancelled"];

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Ирц бүртгэхтэй ижил эрх: багш өөрөө хэн ирснийг тэмдэглэнэ.
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const status = (body as { status?: unknown }).status;
  if (typeof status !== "string" || !(STATUSES as string[]).includes(status)) {
    return NextResponse.json({ ok: false, error: "Төлөв буруу байна" }, { status: 400 });
  }
  const rawNote = (body as { note?: unknown }).note;
  const note = typeof rawNote === "string" ? rawNote.trim() : undefined;
  if (note !== undefined && isTooLong(note, MAX_LEN.lessonTopic)) {
    return NextResponse.json({ ok: false, error: "Тэмдэглэл хэт урт байна" }, { status: 400 });
  }

  const meeting = await setMeetingOutcome(id, { status: status as MeetingStatus, note });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Уулзалт олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "parent_meeting.update",
    targetId: meeting.id,
    details: { status: meeting.status },
  }).catch(() => {});

  return NextResponse.json({ ok: true, meeting });
}
