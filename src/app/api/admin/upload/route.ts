import { NextResponse } from "next/server";
import { uploadCoverImage } from "@/lib/storage";
import { isAdmin } from "@/lib/session";

const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "Зөвхөн зураг оруулна уу" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "Зургийн хэмжээ 5MB-ээс ихгүй байх ёстой" }, { status: 400 });
  }

  try {
    const url = await uploadCoverImage(file);
    return NextResponse.json({ ok: true, url });
  } catch {
    return NextResponse.json({ ok: false, error: "Зураг байршуулахад алдаа гарлаа" }, { status: 500 });
  }
}
