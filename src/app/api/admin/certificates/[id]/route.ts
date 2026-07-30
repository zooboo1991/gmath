import { NextResponse } from "next/server";
import { deleteCertificate } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deleteCertificate(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Сертификат олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
