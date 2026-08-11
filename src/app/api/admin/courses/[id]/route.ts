import { NextResponse } from "next/server";
import { findCourseById, notifyNewCourseForPastStudents, notifyNewRecordings, updateCourse } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
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
  if (
    data.status !== undefined &&
    data.status !== "draft" &&
    data.status !== "published" &&
    data.status !== "archived"
  ) {
    return NextResponse.json({ ok: false, error: "Статус буруу байна" }, { status: 400 });
  }
  const lengthError = validateCourseFields(data);
  if (lengthError) {
    return NextResponse.json({ ok: false, error: lengthError }, { status: 400 });
  }

  const lessons = normalizeLessons(data.lessons);

  const previous = await findCourseById(id);

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
    showOnHomepage: data.showOnHomepage !== undefined ? data.showOnHomepage === true : undefined,
  });

  if (!course) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }

  notifyNewRecordings(id, `${course.title} (${course.tag})`, previous?.lessons ?? [], course.lessons).catch((err) =>
    console.error("[courses] recording notification failed:", err)
  );

  if (previous && previous.status !== "published" && course.status === "published") {
    notifyNewCourseForPastStudents(course).catch((err) =>
      console.error("[courses] new-course notification failed:", err)
    );
  }

  await logAdminAction(request, {
    actionType: "course.update",
    targetId: id,
    details: {
      ...(data.status !== undefined && { status: data.status }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.title !== undefined && { title: data.title }),
    },
  });

  return NextResponse.json({ ok: true, course });
}

// No DELETE handler here on purpose. deleteCourse() (lib/db.ts) hard-deletes
// a course and cascades its registrations with no undo — exactly what wiped
// real registrations twice now, once through the admin "Устгах" button
// before it was rewired to archive, and again through this endpoint staying
// reachable afterward (a stale client could still call it directly even
// with the button gone). The app must never expose a path to it; a true
// delete is a manual script run against the database, nothing else.
