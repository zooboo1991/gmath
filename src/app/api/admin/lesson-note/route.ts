import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import {
  createNoteUploadUrl,
  createSignedUrl,
  isLessonNotePath,
  LESSON_NOTES_BUCKET,
  removeStorageObject,
} from "@/lib/storage";

/** 50 MB. Well past any set of lesson notes; a mis-picked video should be refused, not uploaded. */
const MAX_NOTE_BYTES = 50 * 1024 * 1024;
/** Long enough for the teacher to read the PDF they just uploaded, short enough that the URL is not a handout. */
const ADMIN_VIEW_TTL_SECONDS = 60 * 60;

/**
 * The teacher's side of a lesson's notes PDF: get somewhere to upload it, look
 * at what was uploaded, delete it again.
 *
 * The file itself never passes through here. A serverless request body is
 * capped at 4.5 MB on Vercel and lesson notes are routinely larger, so this
 * hands back a signed upload URL and the browser PUTs straight to Supabase
 * Storage. What lands in the lesson row is the path, saved by the ordinary
 * course/programme PUT.
 */
export async function POST(request: Request) {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const size = Number(data.size);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ ok: false, error: "Файлын хэмжээ буруу байна" }, { status: 400 });
  }
  if (size > MAX_NOTE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Файл 50MB-ээс ихгүй байх ёстой" },
      { status: 400 }
    );
  }

  try {
    const upload = await createNoteUploadUrl();
    return NextResponse.json({ ok: true, ...upload });
  } catch (err) {
    console.error("[lesson-note] upload url failed", err);
    return NextResponse.json(
      { ok: false, error: "Байршуулах хаяг үүсгэхэд алдаа гарлаа. Bucket үүссэн эсэхийг шалгана уу." },
      { status: 500 }
    );
  }
}

/** A signed URL so the teacher can check the upload before a student does. */
export async function GET(request: Request) {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const path = new URL(request.url).searchParams.get("path");
  if (!isLessonNotePath(path)) {
    return NextResponse.json({ ok: false, error: "Файлын зам буруу байна" }, { status: 400 });
  }
  const url = await createSignedUrl(LESSON_NOTES_BUCKET, path, ADMIN_VIEW_TTL_SECONDS);
  if (!url) {
    return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, url });
}

/**
 * Removes the object. The lesson row is cleared by the form's own save, so this
 * is called for its side effect: without it, every replaced set of notes would
 * sit in the bucket forever with nothing pointing at it.
 */
export async function DELETE(request: Request) {
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  if (!isLessonNotePath(data.path)) {
    return NextResponse.json({ ok: false, error: "Файлын зам буруу байна" }, { status: 400 });
  }

  try {
    await removeStorageObject(LESSON_NOTES_BUCKET, data.path);
  } catch (err) {
    console.error("[lesson-note] delete failed", data.path, err);
    return NextResponse.json({ ok: false, error: "Файл устгахад алдаа гарлаа" }, { status: 500 });
  }

  await logAdminAction(request, { actionType: "lesson.note_delete", targetId: data.path });
  return NextResponse.json({ ok: true });
}
