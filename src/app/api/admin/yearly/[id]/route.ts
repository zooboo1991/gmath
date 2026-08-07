import { NextResponse } from "next/server";
import { updateYearlyProgram } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isAdmin } from "@/lib/session";
import { isTooLong, isValidHttpUrl, MAX_LEN } from "@/lib/validate";
import { normalizeLessons, validateLessons } from "@/lib/lessonInput";

function validateProgramFields(data: Record<string, unknown>): string | null {
  if (isTooLong(data.tag, MAX_LEN.courseTag)) return "Ангиллын тэмдэглэгээ хэт урт байна";
  if (isTooLong(data.title, MAX_LEN.courseTitle)) return "Гарчиг хэт урт байна";
  if (isTooLong(data.label, MAX_LEN.courseTitle)) return "Бүтэн нэр хэт урт байна";
  if (isTooLong(data.topics, MAX_LEN.courseTopics)) return "Тайлбар хэт урт байна";
  if (isTooLong(data.price, MAX_LEN.coursePrice)) return "Үнэ хэт урт байна";
  if (isTooLong(data.period, MAX_LEN.coursePeriod)) return "Хугацааны нэгж хэт урт байна";
  if (isTooLong(data.facebookGroup, MAX_LEN.courseFacebookGroup)) return "Facebook группын холбоос хэт урт байна";
  if (typeof data.facebookGroup === "string" && data.facebookGroup.trim() && !isValidHttpUrl(data.facebookGroup)) {
    return "Facebook группын холбоос буруу байна (http:// эсвэл https:// -ээр эхэлнэ)";
  }
  if (isTooLong(data.zoomLink, MAX_LEN.courseZoomLink)) return "Zoom холбоос хэт урт байна";
  if (typeof data.zoomLink === "string" && data.zoomLink.trim() && !isValidHttpUrl(data.zoomLink)) {
    return "Zoom холбоос буруу байна (http:// эсвэл https:// -ээр эхэлнэ)";
  }
  if (isTooLong(data.zoomMeetingId, MAX_LEN.courseZoomMeetingId)) return "Zoom Meeting ID хэт урт байна";
  if (isTooLong(data.zoomPasscode, MAX_LEN.courseZoomPasscode)) return "Zoom нэвтрэх код хэт урт байна";
  return validateLessons(data.lessons);
}

// Only PUT — the two rows ("program-c"/"program-d") are pre-seeded directly
// against the database and never created or deleted through the app, same
// convention as courses' own hard-delete lockout.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json();

  if (
    !data.tag?.trim() ||
    !data.title?.trim() ||
    !data.label?.trim() ||
    !data.price?.trim() ||
    !data.period?.trim()
  ) {
    return NextResponse.json({ ok: false, error: "Заавал бөглөх талбаруудыг бөглөнө үү" }, { status: 400 });
  }
  const lengthError = validateProgramFields(data);
  if (lengthError) {
    return NextResponse.json({ ok: false, error: lengthError }, { status: 400 });
  }

  const lessons = normalizeLessons(data.lessons) ?? [];

  const program = await updateYearlyProgram(id, {
    tag: data.tag.trim(),
    title: data.title.trim(),
    label: data.label.trim(),
    topics: data.topics?.trim() ?? "",
    price: data.price.trim(),
    period: data.period.trim(),
    facebookGroup: data.facebookGroup?.trim() || undefined,
    zoomLink: data.zoomLink?.trim() || undefined,
    zoomMeetingId: data.zoomMeetingId?.trim() || undefined,
    zoomPasscode: data.zoomPasscode?.trim() || undefined,
    lessons,
  });

  if (!program) {
    return NextResponse.json({ ok: false, error: "Хөтөлбөр олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "yearly_program.update",
    targetId: id,
    details: { title: program.title, price: program.price },
  });

  return NextResponse.json({ ok: true, program });
}
