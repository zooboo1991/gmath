import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { createContractUploadUrl } from "@/lib/storage";

/** 20 MB — гэрээ бол хэдхэн хуудас; үүнээс том файл бол буруу сонгосон файл. */
const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;

/**
 * Word загварыг браузераас шууд Storage руу тавих хаяг.
 *
 * Хичээлийн тэмдэглэлтэй ижил шалтгаанаар файл өөрөө энэ route-оор дамждаггүй:
 * Vercel-ийн 4.5MB-ийн body хязгаарт орох эрсдэлгүй байх ёстой.
 */
export async function POST(request: Request) {
  if (!(await requireCapability("siteAdmin")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const size = Number(data.size);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ ok: false, error: "Файлын хэмжээ буруу байна" }, { status: 400 });
  }
  if (size > MAX_TEMPLATE_BYTES) {
    return NextResponse.json({ ok: false, error: "Файл 20MB-ээс ихгүй байх ёстой" }, { status: 400 });
  }

  try {
    const upload = await createContractUploadUrl();
    return NextResponse.json({ ok: true, ...upload });
  } catch (err) {
    console.error("[contracts] upload url failed", err);
    return NextResponse.json(
      { ok: false, error: "Байршуулах хаяг үүсгэхэд алдаа гарлаа. contracts bucket үүссэн эсэхийг шалгана уу." },
      { status: 500 }
    );
  }
}
