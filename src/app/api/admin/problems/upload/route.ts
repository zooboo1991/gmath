import { NextResponse } from "next/server";
import { uploadProblemImage } from "@/lib/storage";
import { isFullAdmin } from "@/lib/session";

const MAX_SIZE = 5 * 1024 * 1024;

/**
 * Problem figures go to the public "problems" bucket — unlike student
 * solutions, a problem image is shown to every candidate anyway.
 */
export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
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
    const url = await uploadProblemImage(file);
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
