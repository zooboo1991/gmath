import { NextResponse } from "next/server";
import {
  bookMeeting,
  cancelOwnMeeting,
  findUpcomingMeeting,
  findYearlyProgramme,
  placementExamState,
  listMeetingDays,
  listTakenSlots,
} from "@/lib/parentMeetingDb";
import {
  isBookableDay,
  isMeetingSlot,
  meetingDayLabel,
  meetingSlots,
  meetingSmsRecipient,
  meetingSmsText,
} from "@/lib/parentMeeting";
import { sendSms } from "@/lib/sms/skytel";
import { getSessionUser } from "@/lib/session";

/**
 * Багштай хийх уулзалтын цаг — сурагчийн тал.
 *
 * Эрх шалгах нь хоёр дахин: жагсаалт харуулахдаа ч, захиалахдаа ч. Зөвхөн
 * эхнийхийг шалгавал 1 жилийн хөтөлбөрт байхгүй хүн гараар хүсэлт илгээж
 * багшийн цагийг эзэлнэ.
 */

async function openDays() {
  const dates = (await listMeetingDays({ upcomingOnly: true }).catch(() => [])) as string[];
  const taken = await listTakenSlots(dates).catch(() => new Map<string, Set<string>>());
  const all = meetingSlots();
  return dates.map((date) => {
    const gone = taken.get(date) ?? new Set<string>();
    return {
      date,
      label: meetingDayLabel(date),
      slots: all.filter((slot) => !gone.has(slot)),
      // Дүүрсэн өдрийг нуухгүй, "сул цаг алга" гэж харуулна — эцэг эх тэр
      // өдөр огт байхгүй гэж бодохоос дээр.
      full: all.every((slot) => gone.has(slot)),
    };
  });
}

/** Түвшин тогтоох шалгалт руу чиглүүлэх газар — сургалтын хуудасны таб. */
function examHref(programId: string): string {
  return `/profile/course/${programId}?tab=assessment`;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: true, signedIn: false, eligible: false, days: [], meeting: null });
  }
  const programId = await findYearlyProgramme(user.id).catch(() => undefined);
  if (!programId) {
    return NextResponse.json({ ok: true, signedIn: true, eligible: false, days: [], meeting: null });
  }
  const [days, meeting, examState] = await Promise.all([
    openDays(),
    findUpcomingMeeting(user.id).catch(() => undefined),
    placementExamState(user.id).catch(() => "none" as const),
  ]);
  const meetingView = meeting
    ? {
        id: meeting.id,
        meetingDate: meeting.meetingDate,
        label: meetingDayLabel(meeting.meetingDate),
        slot: meeting.slot,
      }
    : null;

  // Шалгалтаа өгөөгүй бол цаг харуулахгүй, шалгалт руу чиглүүлнэ. Гэхдээ
  // дүрэм гарахаас өмнө захиалчихсан цаг байвал хэвээр харуулна — хүний
  // төлөвлөгөөг чимээгүй алга болгох нь чиглүүлэхээс муу.
  if (examState !== "done" && !meetingView) {
    return NextResponse.json({
      ok: true,
      signedIn: true,
      eligible: true,
      examRequired: true,
      examState,
      examHref: examHref(programId),
      // Уулзалтын ээлж явагдаж байгаа эсэх. Нээлттэй өдөр байхгүй бол
      // шалгалт руу шахах карт ч гаргахгүй — профайл дээр утгагүй сануулга.
      hasOpenDays: days.length > 0,
      days: [],
      meeting: null,
    });
  }

  return NextResponse.json({
    ok: true,
    signedIn: true,
    eligible: true,
    examRequired: false,
    days,
    meeting: meetingView,
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  const programId = await findYearlyProgramme(user.id).catch(() => undefined);
  if (!programId) {
    return NextResponse.json(
      { ok: false, error: "Багштай уулзах цагийг 1 жилийн хөтөлбөрийн сурагчид захиална." },
      { status: 403 }
    );
  }
  // Уулзалт нь шалгалтын дүнг ярилцах зорилготой — шалгалтгүй бол ярих зүйл
  // алга. Жагсаалт харуулахгүй байгаа ч гараар илгээсэн хүсэлтийг энд барина.
  if ((await placementExamState(user.id).catch(() => "none")) !== "done") {
    return NextResponse.json(
      {
        ok: false,
        error: "Эхлээд түвшин тогтоох шалгалтаа өгнө үү. Бодолтоо илгээсний дараа цаг сонгох боломжтой болно.",
        examHref: examHref(programId),
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const date = typeof (body as { date?: unknown }).date === "string" ? (body as { date: string }).date : "";
  const slot = typeof (body as { slot?: unknown }).slot === "string" ? (body as { slot: string }).slot : "";

  // Өдөр нь нээлттэй байх ба цаг нь сүлжээнд байх ёстой. Клиентээс ирсэн
  // "би энэ цагийг сонголоо" гэдэгт найдвал багш байхгүй өдөр захиалагдана.
  const open: string[] = await listMeetingDays({ upcomingOnly: true }).catch(() => []);
  if (!open.includes(date) || !isBookableDay(date) || !isMeetingSlot(slot)) {
    return NextResponse.json(
      { ok: false, error: "Энэ өдөр, цаг сонгох боломжгүй байна. Жагсаалтаас сонгоно уу." },
      { status: 400 }
    );
  }

  const result = await bookMeeting({ userId: user.id, meetingDate: date, slot });
  if (!result.ok) {
    return result.reason === "already_booked"
      ? NextResponse.json(
          { ok: false, error: "Та аль хэдийн цаг захиалсан байна. Хуучин цагаа болиод шинээр захиална уу." },
          { status: 409 }
        )
      : NextResponse.json(
          { ok: false, error: "Энэ цагийг сая өөр хүн авчихлаа. Өөр цаг сонгоно уу." },
          { status: 409 }
        );
  }
  // Эцэг эхэд SMS. Алдаа нь захиалгыг унагахгүй — цаг аль хэдийн
  // баталгаажсан, дэлгэц дээр ч харагдаж байгаа. Логт утас бичихгүй.
  try {
    await sendSms(meetingSmsRecipient(user), meetingSmsText(date, slot));
  } catch (err) {
    console.error("[parent-meeting] sms failed:", result.meeting.id, err);
  }

  return NextResponse.json({
    ok: true,
    meeting: {
      id: result.meeting.id,
      meetingDate: result.meeting.meetingDate,
      label: meetingDayLabel(result.meeting.meetingDate),
      slot: result.meeting.slot,
    },
  });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = typeof (body as { id?: unknown }).id === "string" ? (body as { id: string }).id : "";
  // Эзэмшигчээр нь хязгаарлана: id таасан ч өөр хүний цагийг болиулж болохгүй.
  const cancelled = await cancelOwnMeeting(id, user.id);
  if (!cancelled) {
    return NextResponse.json({ ok: false, error: "Захиалга олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
