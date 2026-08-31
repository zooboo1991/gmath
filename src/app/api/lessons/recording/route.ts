import { NextResponse } from "next/server";
import { findCourseById, findRegistrationByUserAndProgram, findYearlyProgramById } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { bunnyConfigured, parseBunnyVideoId, signBunnyEmbedUrl } from "@/lib/bunny";
import { recordRecordingView } from "@/lib/recordingViews";

/**
 * Hands back a short-lived, signed playback URL for one lesson's recording.
 *
 * Mirrors /api/lessons/join: the signed URL is minted here, never in the page,
 * so it only ever exists for a student who is actively registered on that
 * course. Anyone else — including a signed-in student on a different course —
 * gets a 404 rather than a 403, so this can't be used to find out which
 * recordings exist.
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
  const recordingLink = owner?.lessons?.[lessonIndex]?.recordingLink;
  if (!recordingLink) {
    return NextResponse.json({ ok: false, error: "Энэ хичээлийн бичлэг алга байна" }, { status: 404 });
  }

  // Тэмдэглэгээ энд хийгдэнэ: сурагч бүртгэлтэй нь шалгагдсан, бичлэг нь
  // байгаа нь батлагдсан цэг. Алдаа гарвал үл тоомсорлоно — ирцийн
  // тоолуурын төлөө бичлэгийг нь хаах учиргүй.
  await recordRecordingView({ courseId, lessonIndex, userId: user.id }).catch(() => {});

  const videoId = parseBunnyVideoId(recordingLink);
  if (!videoId) {
    // Recordings that still live on Drive/YouTube: the page opens them the old
    // way, so say so plainly rather than pretending we can embed it.
    return NextResponse.json({ ok: true, external: true, url: recordingLink });
  }
  if (!bunnyConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Видео тоглуулагч хараахан тохируулагдаагүй байна" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, external: false, url: signBunnyEmbedUrl(videoId) });
}
