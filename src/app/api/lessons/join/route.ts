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
 *
 * Two entry points share the resolution below: the profile page's "Хичээлд
 * орох" button POSTs and renders errors inline, and a lesson-reminder
 * notification GETs and is redirected — a notification click has no page of
 * its own to show JSON on.
 */
type JoinResolution = { ok: true; joinUrl: string } | { ok: false; status: number; error: string };

async function resolveJoinUrl(
  userId: string,
  user: { email: string; firstName: string; lastName: string },
  courseId: string,
  lessonIndex: number
): Promise<JoinResolution> {
  // Ownership: only an actively-registered student can get a join link —
  // 404 rather than 403 so this can't be used to probe which courses exist.
  const registration = await findRegistrationByUserAndProgram(userId, courseId);
  if (!registration || registration.status !== "active") {
    return { ok: false, status: 404, error: "Хичээл олдсонгүй" };
  }

  const meeting = await findLessonMeeting(courseId, lessonIndex);
  if (!meeting) {
    // programId can be a real course (UUID) or a yearly program ("program-c"
    // etc.) — same opaque-id split used everywhere else this can happen.
    const owner = (await findYearlyProgramById(courseId)) ?? (await findCourseById(courseId));
    const fallbackLink = owner?.lessons?.[lessonIndex]?.zoomLink;
    if (!fallbackLink) {
      return { ok: false, status: 404, error: "Энэ хичээлд Zoom холбоос алга байна" };
    }
    return { ok: true, joinUrl: fallbackLink };
  }

  const existing = await findRegistrant(meeting.id, userId);
  if (existing) {
    return { ok: true, joinUrl: existing.joinUrl };
  }

  try {
    const registrant = await addRegistrant(meeting.zoomMeetingId, {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
    await createRegistrant({
      lessonMeetingId: meeting.id,
      userId,
      zoomRegistrantId: registrant.registrantId,
      joinUrl: registrant.joinUrl,
    });
    return { ok: true, joinUrl: registrant.joinUrl };
  } catch (err) {
    console.error("zoom registrant failed", courseId, lessonIndex, userId, err);
    return { ok: false, status: 502, error: "Zoom-д бүртгэхэд алдаа гарлаа. Дахин оролдоно уу." };
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const { courseId, lessonIndex } = await request.json().catch(() => ({}));
  if (typeof courseId !== "string" || typeof lessonIndex !== "number") {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const result = await resolveJoinUrl(user.id, user, courseId, lessonIndex);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, joinUrl: result.joinUrl });
}

/**
 * The notification-click entry: resolves the same way and redirects into the
 * Zoom room. Every failure lands on the profile page instead of a JSON error —
 * the student who tapped a reminder still ends up somewhere with their courses
 * on it. Creating the Zoom registrant on a GET is deliberate: the second GET
 * finds the existing registrant, so a re-click or a link prefetch cannot
 * register anyone twice.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getSessionUser();
  if (!user) {
    // There is no standalone login page — the profile route shows the sign-in
    // flow itself when the visitor has no session.
    return NextResponse.redirect(new URL("/profile", url));
  }

  const courseId = url.searchParams.get("courseId") ?? "";
  const lessonIndex = Number(url.searchParams.get("lessonIndex"));
  if (!courseId || !Number.isInteger(lessonIndex) || lessonIndex < 0) {
    return NextResponse.redirect(new URL("/profile", url));
  }

  const result = await resolveJoinUrl(user.id, user, courseId, lessonIndex);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/profile?course=${encodeURIComponent(courseId)}`, url));
  }
  return NextResponse.redirect(result.joinUrl);
}
