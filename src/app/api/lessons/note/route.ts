import { NextResponse } from "next/server";
import { findCourseById, findRegistrationByUserAndProgram, findYearlyProgramById } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { createSignedUrl, isLessonNotePath, LESSON_NOTES_BUCKET } from "@/lib/storage";

/** Same three hours a recording link gets: enough to read and re-read, short enough that a copied link dies the same day. */
const TTL_SECONDS = 3 * 60 * 60;

/**
 * Hands back a short-lived, signed URL for one lesson's notes PDF.
 *
 * Deliberately the same shape and the same gate as /api/lessons/recording: the
 * notes are the lesson's content just as much as the video is, so a student who
 * is not actively registered on that course must not be able to read them, and
 * gets a 404 rather than a 403 — which lesson has notes is itself not something
 * to leak.
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

  const registration = await findRegistrationByUserAndProgram(user.id, courseId);
  if (!registration || registration.status !== "active") {
    return NextResponse.json({ ok: false, error: "Хичээл олдсонгүй" }, { status: 404 });
  }

  // programId is either a real course (UUID) or a yearly program ("program-c").
  const owner = (await findYearlyProgramById(courseId)) ?? (await findCourseById(courseId));
  const noteFile = owner?.lessons?.[lessonIndex]?.noteFile;
  if (!isLessonNotePath(noteFile)) {
    return NextResponse.json({ ok: false, error: "Энэ хичээлийн тэмдэглэл алга байна" }, { status: 404 });
  }

  const url = await createSignedUrl(LESSON_NOTES_BUCKET, noteFile, TTL_SECONDS);
  if (!url) {
    return NextResponse.json({ ok: false, error: "Тэмдэглэл нээхэд алдаа гарлаа" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, url });
}
