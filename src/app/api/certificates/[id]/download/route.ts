import { NextResponse } from "next/server";
import { listCertificatesByPhone, logCertificateEvent } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { renderCertificatePdf } from "@/lib/certificateRender";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтрээгүй байна" }, { status: 401 });
  }

  const { id } = await params;

  // Certificates are only ever looked up by the signed-in user's own phone —
  // there's no lookup-by-id, so an id for someone else's certificate simply
  // won't appear in this list.
  const own = await listCertificatesByPhone(user.phone);
  const certificate = own.find((c) => c.id === id);
  if (!certificate) {
    return NextResponse.json({ ok: false, error: "Сертификат олдсонгүй" }, { status: 404 });
  }

  const pdfBytes = await renderCertificatePdf(certificate);
  await logCertificateEvent(certificate.id, "download");
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="sertifikat-${certificate.certificateNumber}.pdf"`,
    },
  });
}
