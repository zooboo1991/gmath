import { NextResponse } from "next/server";
import { findCourseById, findRegistrationByUserAndProgram, findYearlyProgramById } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { addRegistrant } from "@/lib/zoom/client";
import { createRegistrant, findLessonMeeting, findRegistrant } from "@/lib/zoom/db";

/**
 * Resolves the join link for one lesson. If the lesson has a tracked Zoom
 * meeting (admin created one via /api/admin/courses/[id]/lessons/[index]/zoom-meeting),
 * this registers the student on first click and hands back their personal
 * join_url from then on — required for the webhook to attribute attendance
 * to a specific person. Otherwise it falls back to the lesson's plain
 * zoomLink, same as before this feature existed.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const { courseId, lessonIndex } = await request.json().catch(() => ({}));
  if (typeof courseId !== "string" || typeof lessonIndex !== "number") {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  // Ownership: only an actively-registered student can get a join link —
  // 404 rather than 403 so this can't be used to probe which courses exist.
  const registration = await findRegistrationByUserAndProgram(user.id, courseId);
  if (!registration || registration.status !== "active") {
    return NextResponse.json({ ok: false, error: "Хичээл олдсонгүй" }, { status: 404 });
  }

  const meeting = await findLessonMeeting(courseId, lessonIndex);
  if (!meeting) {
    // programId can be a real course (UUID) or a yearly program ("program-c"
    // etc.) — same opaque-id split used everywhere else this can happen.
    const owner = (await findYearlyProgramById(courseId)) ?? (await findCourseById(courseId));
    const fallbackLink = owner?.lessons?.[lessonIndex]?.zoomLink;
    if (!fallbackLink) {
      return NextResponse.json({ ok: false, error: "Энэ хичээлд Zoom холбоос алга байна" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, joinUrl: fallbackLink });
  }

  const existing = await findRegistrant(meeting.id, user.id);
  if (existing) {
    return NextResponse.json({ ok: true, joinUrl: existing.joinUrl });
  }

  try {
    const registrant = await addRegistrant(meeting.zoomMeetingId, {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
    await createRegistrant({
      lessonMeetingId: meeting.id,
      userId: user.id,
      zoomRegistrantId: registrant.registrantId,
      joinUrl: registrant.joinUrl,
    });
    return NextResponse.json({ ok: true, joinUrl: registrant.joinUrl });
  } catch (err) {
    console.error("zoom registrant failed", courseId, lessonIndex, user.id, err);
    return NextResponse.json(
      { ok: false, error: "Zoom-д бүртгэхэд алдаа гарлаа. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}
