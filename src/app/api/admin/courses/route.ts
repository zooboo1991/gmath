import { NextResponse } from "next/server";
import { addCourse, listCourses } from "@/lib/db";
import { isAdmin } from "@/lib/session";
import { isTooLong, isValidHttpUrl, MAX_LEN } from "@/lib/validate";
import { normalizeLessons, validateLessons } from "@/lib/lessonInput";

function validateCourseFields(data: Record<string, unknown>): string | null {
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
  if (isTooLong(data.tag, MAX_LEN.courseTag)) return "Ангилал тэмдэглэгээ хэт урт байна";
  if (isTooLong(data.title, MAX_LEN.courseTitle)) return "Гарчиг хэт урт байна";
  if (isTooLong(data.topics, MAX_LEN.courseTopics)) return "Тайлбар хэт урт байна";
  if (isTooLong(data.price, MAX_LEN.coursePrice)) return "Үнэ хэт урт байна";
  if (isTooLong(data.period, MAX_LEN.coursePeriod)) return "Хугацааны нэгж хэт урт байна";
  if (isTooLong(data.startDate, MAX_LEN.courseDate)) return "Хичээллэх өдөр хэт урт байна";
  if (isTooLong(data.mode, MAX_LEN.courseMode)) return "Төрөл хэт урт байна";
  return validateLessons(data.lessons);
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  // Admin listings include drafts; only the public pages filter them out.
  return NextResponse.json({ ok: true, courses: await listCourses(undefined, { includeDrafts: true }) });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json();

  if (data.kind !== "upcoming" && data.kind !== "vod") {
    return NextResponse.json({ ok: false, error: "Төрлийг сонгоно уу" }, { status: 400 });
  }
  if (!data.tag?.trim() || !data.title?.trim() || !data.price?.trim() || !data.period?.trim()) {
    return NextResponse.json({ ok: false, error: "Заавал бөглөх талбарууд дутуу байна" }, { status: 400 });
  }
  const lengthError = validateCourseFields(data);
  if (lengthError) {
    return NextResponse.json({ ok: false, error: lengthError }, { status: 400 });
  }

  const lessons = normalizeLessons(data.lessons) ?? [];

  // New objects are created as drafts by default — an admin must explicitly
  // publish them from the course Object Page, matching the Fiori "create as
  // draft" pattern. Existing rows are unaffected (see schema.sql).
  const status = data.status === "published" ? "published" : "draft";

  const course = await addCourse({
    kind: data.kind,
    status,
    tag: data.tag.trim(),
    title: data.title.trim(),
    topics: data.topics?.trim() ?? "",
    price: data.price.trim(),
    period: data.period.trim(),
    startDate: data.startDate?.trim() || undefined,
    mode: data.mode?.trim() || undefined,
    coverImage: data.coverImage?.trim() || undefined,
    facebookGroup: data.facebookGroup?.trim() || undefined,
    zoomLink: data.zoomLink?.trim() || undefined,
    zoomMeetingId: data.zoomMeetingId?.trim() || undefined,
    zoomPasscode: data.zoomPasscode?.trim() || undefined,
    lessons,
    showOnHomepage: data.showOnHomepage === true,
  });

  return NextResponse.json({ ok: true, course });
}
