import { NextResponse } from "next/server";
import { createCertificate, listCertificates, upsertCertificates, type CertificateImportRow } from "@/lib/db";
import { isFullAdmin } from "@/lib/session";
import { parseCertificateWorkbook, validateCertificateManualInput } from "@/lib/certificateImport";

const MAX_SIZE = 5 * 1024 * 1024;

export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const certificates = await listCertificates();
  return NextResponse.json({ ok: true, certificates });
}

export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  // The admin form submits JSON for a single, hand-entered certificate;
  // the Excel importer submits multipart form data with a file.
  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const data = await request.json();
    const result = validateCertificateManualInput(data);
    if ("error" in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    try {
      const certificate = await createCertificate(result.value as CertificateImportRow);
      return NextResponse.json({ ok: true, certificate });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "Энэ дугаартай сертификат аль хэдийн бүртгэгдсэн байна" },
          { status: 409 }
        );
      }
      throw err;
    }
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
