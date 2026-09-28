import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { addMeetingDay, listMeetingDays, removeMeetingDay } from "@/lib/parentMeetingDb";
import { isBookableDay } from "@/lib/parentMeeting";

/**
 * Уулзалт болох өдрүүдийг нээх, хаах.
 *
 * Өдөр нээгээгүй бол сурагчдад цаг огт харагдахгүй — багш байхгүй өдөр
 * хүүхэд ирчихээс сэргийлэх цорын ганц хаалга нь энэ.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(body: unknown): string | null {
  const value = (body as { date?: unknown })?.date;
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  // Огноо бодитой эсэх: "2026-02-31" загварт таарах ч өдөр биш.
  const at = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== value ? null : value;
}

export async function GET() {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  return NextResponse.json({ ok: true, days: await listMeetingDays() });
}

export async function POST(request: Request) {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const date = parseDate(await request.json().catch(() => ({})));
  if (!date) {
    return NextResponse.json({ ok: false, error: "Огноо буруу байна" }, { status: 400 });
  }
  if (!isBookableDay(date)) {
    return NextResponse.json(
      { ok: false, error: "Өнгөрсөн өдрийг нээх боломжгүй." },
      { status: 400 }
    );
  }
  await addMeetingDay(date);
  await logAdminAction(request, { actionType: "parent_meeting_day.open", details: { date } }).catch(
    () => {}
  );
  return NextResponse.json({ ok: true, days: await listMeetingDays() });
}

export async function DELETE(request: Request) {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const date = parseDate(await request.json().catch(() => ({})));
  if (!date) {
    return NextResponse.json({ ok: false, error: "Огноо буруу байна" }, { status: 400 });
  }
  // Захиалсан цагуудыг устгахгүй — өдөр нь зөвхөн ШИНЭЭР захиалахад хаагдана.
  await removeMeetingDay(date);
  await logAdminAction(request, {
    actionType: "parent_meeting_day.close",
    details: { date },
  }).catch(() => {});
  return NextResponse.json({ ok: true, days: await listMeetingDays() });
}
