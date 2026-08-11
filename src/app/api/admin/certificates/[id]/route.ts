import { NextResponse } from "next/server";
import { deleteCertificate, updateCertificate } from "@/lib/db";
import { isFullAdmin } from "@/lib/session";
import { validateCertificateManualInput } from "@/lib/certificateImport";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json();

  const result = validateCertificateManualInput(data, { partial: true });
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  try {
    const certificate = await updateCertificate(id, result.value);
    if (!certificate) {
      return NextResponse.json({ ok: false, error: "Сертификат олдсонгүй" }, { status: 404 });
    }
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deleteCertificate(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Сертификат олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
