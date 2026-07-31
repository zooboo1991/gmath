import { NextResponse } from "next/server";
import { findAssessment, updateAssessment } from "@/lib/assessment/db";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/assessment/config";
import { isAdmin } from "@/lib/session";
import { createSignedUrl, GRADED_SHEETS_BUCKET, uploadPrivateImage } from "@/lib/storage";

const MAX_SIZE = 5 * 1024 * 1024;

/** The teacher's scanned, marked-up sheet. Private, like the solutions. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await findAssessment(id))) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "Зургийн хэмжээ 5MB-ээс ихгүй байх ёстой" }, { status: 400 });
  }

  try {
    const path = await uploadPrivateImage(file, GRADED_SHEETS_BUCKET, id);
    await updateAssessment(id, { graded_sheet_path: path });
    const url = await createSignedUrl(GRADED_SHEETS_BUCKET, path, SIGNED_URL_TTL_SECONDS);
    return NextResponse.json({ ok: true, url });
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
