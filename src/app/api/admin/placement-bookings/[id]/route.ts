import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { setBookingOutcome, type BookingStatus } from "@/lib/placementBookingDb";
import { isTooLong, MAX_LEN } from "@/lib/validate";

/** Ирсэн / ирээгүй гэж тэмдэглэх, багшийн тэмдэглэл үлдээх. */
const STATUSES: BookingStatus[] = ["booked", "came", "missed", "cancelled"];

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

  const booking = await setBookingOutcome(id, { status: status as BookingStatus, note });
  if (!booking) {
    return NextResponse.json({ ok: false, error: "Захиалга олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "placement_booking.update",
    targetId: booking.id,
    details: { status: booking.status },
  }).catch(() => {});

  return NextResponse.json({ ok: true, booking });
}
