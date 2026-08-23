import { NextResponse } from "next/server";
import { findAssessment, updateAssessment } from "@/lib/assessment/db";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/assessment/config";
import { isFullAdmin } from "@/lib/session";
import {
  createSignedUrl,
  GRADED_SHEETS_BUCKET,
  removeStorageObject,
  uploadPrivateImage,
} from "@/lib/storage";

const MAX_SIZE = 5 * 1024 * 1024;
/** Enough for a marked-up paper of any length; a runaway loop is not. */
const MAX_SHEETS = 20;

/**
 * The teacher's marked-up pages. Private, like the students' own solutions.
 *
 * Several per assessment: one photo per page is how marking a paper by hand
 * actually comes out, and the single-image version meant every upload silently
 * replaced the last. The pre-split column is left alone — assessments graded
 * before this still hold their one scan there and the student still sees it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }
  if (assessment.gradedSheetPaths.length >= MAX_SHEETS) {
    return NextResponse.json(
      { ok: false, error: `Хамгийн ихдээ ${MAX_SHEETS} зураг хавсаргана` },
      { status: 400 }
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "Зургийн хэмжээ 5MB-ээс ихгүй байх ёстой" }, { status: 400 });
  }

  try {
    const path = await uploadPrivateImage(file, GRADED_SHEETS_BUCKET, id);
    // Re-read rather than trusting the copy above: two pages uploaded at once
    // would otherwise each write a one-element array and lose the other.
    const current = (await findAssessment(id))?.gradedSheetPaths ?? [];
    await updateAssessment(id, { graded_sheet_paths: [...current, path] });
    const url = await createSignedUrl(GRADED_SHEETS_BUCKET, path, SIGNED_URL_TTL_SECONDS);
    return NextResponse.json({ ok: true, path, url });
  } catch (err) {
    if (err instanceof Error && err.message === "unsupported_image_type") {
      return NextResponse.json(
        { ok: false, error: "Зөвхөн PNG, JPG, GIF, WEBP форматын зураг оруулна уу" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: false, error: "Зураг байршуулахад алдаа гарлаа" }, { status: 500 });
  }
}

/** Removes one page — a mis-scanned photo should not be stuck on the verdict. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }

  const data = await request.json().catch(() => ({}));
  const path = typeof data.path === "string" ? data.path : "";
  // Only a page belonging to this assessment, so the id in the URL cannot be
  // used to delete some other student's scan.
  if (!path || !assessment.gradedSheetPaths.includes(path)) {
    return NextResponse.json({ ok: false, error: "Зураг олдсонгүй" }, { status: 404 });
  }

  await updateAssessment(id, {
    graded_sheet_paths: assessment.gradedSheetPaths.filter((p) => p !== path),
  });
  await removeStorageObject(GRADED_SHEETS_BUCKET, path).catch((err) =>
    // The row no longer points at it; a leftover object is not worth failing on.
    console.error("[grading] sheet delete failed", path, err)
  );

  return NextResponse.json({ ok: true });
}
