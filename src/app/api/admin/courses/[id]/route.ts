import { NextResponse } from "next/server";
import { deleteCourse, updateCourse } from "@/lib/db";
import { isAdmin } from "@/lib/session";
import { isTooLong, isValidHttpUrl, MAX_LEN } from "@/lib/validate";

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
  if (Array.isArray(data.lessons)) {
    for (const l of data.lessons as { topic?: string; schedule?: string }[]) {
      if (isTooLong(l.topic, MAX_LEN.lessonTopic) || isTooLong(l.schedule, MAX_LEN.lessonSchedule)) {
        return "Хичээлийн мэдээлэл хэт урт байна";
      }
    }
  }
  return null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json();

  if (
    (data.tag !== undefined && !data.tag.trim()) ||
    (data.title !== undefined && !data.title.trim()) ||
    (data.price !== undefined && !data.price.trim()) ||
    (data.period !== undefined && !data.period.trim())
  ) {
    return NextResponse.json({ ok: false, error: "Заавал бөглөх талбаруудыг хоослож болохгүй" }, { status: 400 });
  }
  if (data.status !== undefined && data.status !== "draft" && data.status !== "published") {
    return NextResponse.json({ ok: false, error: "Статус буруу байна" }, { status: 400 });
  }
  const lengthError = validateCourseFields(data);
  if (lengthError) {
    return NextResponse.json({ ok: false, error: lengthError }, { status: 400 });
  }

  const lessons = Array.isArray(data.lessons)
    ? data.lessons
        .map((l: { topic?: string; schedule?: string }) => ({
          topic: l.topic?.trim() ?? "",
          schedule: l.schedule?.trim() || undefined,
        }))
        .filter((l: { topic: string }) => l.topic)
    : undefined;

  const course = await updateCourse(id, {
    status: data.status,
    tag: data.tag?.trim(),
    title: data.title?.trim(),
    topics: data.topics?.trim(),
    price: data.price?.trim(),
    period: data.period?.trim(),
    startDate: data.startDate?.trim() || undefined,
    mode: data.mode?.trim() || undefined,
    coverImage: data.coverImage !== undefined ? data.coverImage?.trim() || "" : undefined,
    facebookGroup: data.facebookGroup !== undefined ? data.facebookGroup?.trim() || "" : undefined,
    zoomLink: data.zoomLink !== undefined ? data.zoomLink?.trim() || "" : undefined,
    zoomMeetingId: data.zoomMeetingId !== undefined ? data.zoomMeetingId?.trim() || "" : undefined,
    zoomPasscode: data.zoomPasscode !== undefined ? data.zoomPasscode?.trim() || "" : undefined,
    lessons,
  });

  if (!course) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, course });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deleteCourse(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
