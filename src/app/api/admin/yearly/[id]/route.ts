import { NextResponse } from "next/server";
import {
  findYearlyProgramById,
  notifyNewRecordings,
  setProgramArticles,
  updateYearlyProgram,
} from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
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
  if (isTooLong(data.introVideoUrl, MAX_LEN.courseZoomLink)) return "Танилцуулга бичлэгийн холбоос хэт урт байна";
  if (typeof data.introVideoUrl === "string" && data.introVideoUrl.trim() && !isValidHttpUrl(data.introVideoUrl)) {
    return "Танилцуулга бичлэгийн холбоос буруу байна (http:// эсвэл https:// -ээр эхэлнэ)";
  }
  return validateLessons(data.lessons);
}

// Only PUT — the two rows ("program-c"/"program-d") are pre-seeded directly
// against the database and never created or deleted through the app, same
// convention as courses' own hard-delete lockout.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
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

  // Only when lessons were actually sent. `?? []` looked harmless and was not:
  // a request that simply doesn't mention lessons would erase the schedule.
  const lessons = data.lessons === undefined ? undefined : (normalizeLessons(data.lessons) ?? []);

  const previous = await findYearlyProgramById(id);

  const program = await updateYearlyProgram(id, {
    tag: data.tag.trim(),
    title: data.title.trim(),
    label: data.label.trim(),
    topics: data.topics?.trim() ?? "",
    price: data.price.trim(),
    period: data.period.trim(),
    // Present-but-empty clears the field; absent leaves it alone. The first
    // version of this cleared on absence too, so any request that didn't
    // mention a field wiped it — which is exactly how this programme lost its
    // Facebook group, its intro video and its lesson row.
    facebookGroup: data.facebookGroup !== undefined ? data.facebookGroup?.trim() || "" : undefined,
    zoomLink: data.zoomLink !== undefined ? data.zoomLink?.trim() || "" : undefined,
    zoomMeetingId: data.zoomMeetingId !== undefined ? data.zoomMeetingId?.trim() || "" : undefined,
    zoomPasscode: data.zoomPasscode !== undefined ? data.zoomPasscode?.trim() || "" : undefined,
    introVideoUrl: data.introVideoUrl !== undefined ? data.introVideoUrl?.trim() || "" : undefined,
    lessons,
    showOnHomepage: data.showOnHomepage !== undefined ? data.showOnHomepage === true : undefined,
  });

  if (!program) {
    return NextResponse.json({ ok: false, error: "Хөтөлбөр олдсонгүй" }, { status: 404 });
  }

  // Article links live in their own table, so they are written after the row
  // update rather than as part of it. Only when the field was actually sent —
  // a save from a form that has no article picker must not wipe the list.
  let articleIds: string[] | undefined;
  if (Array.isArray(data.articleIds)) {
    const ids = data.articleIds.filter((v: unknown): v is string => typeof v === "string").slice(0, 20);
    await setProgramArticles(id, ids);
    articleIds = ids;
  }

  notifyNewRecordings(id, program.label, previous?.lessons ?? [], program.lessons).catch((err) =>
    console.error("[yearly] recording notification failed:", err)
  );

  await logAdminAction(request, {
    actionType: "yearly_program.update",
    targetId: id,
    details: {
      title: program.title,
      price: program.price,
      ...(articleIds !== undefined && { articleIds }),
    },
  });

  return NextResponse.json({ ok: true, program });
}
