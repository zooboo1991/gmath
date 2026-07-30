import { NextResponse } from "next/server";
import { listCertificates, upsertCertificates } from "@/lib/db";
import { isAdmin } from "@/lib/session";
import { parseCertificateWorkbook } from "@/lib/certificateImport";

const MAX_SIZE = 5 * 1024 * 1024;

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const certificates = await listCertificates();
  return NextResponse.json({ ok: true, certificates });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "Файлын хэмжээ 5MB-ээс ихгүй байх ёстой" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseCertificateWorkbook(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      { ok: false, error: "Excel файлыг уншиж чадсангүй. Файл эвдэрхий эсвэл дэмжигдэхгүй формат байна" },
      { status: 400 }
    );
  }

  if (parsed.headerErrors.length > 0) {
    return NextResponse.json({ ok: false, error: parsed.headerErrors.join(", ") }, { status: 400 });
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Импорт хийх мөр олдсонгүй" }, { status: 400 });
  }

  const imported = await upsertCertificates(parsed.rows);
  return NextResponse.json({ ok: true, imported, skipped: parsed.rowErrors });
}
