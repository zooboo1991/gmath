import { NextResponse } from "next/server";
import { findCourseById, findYearlyProgramById, planCertificatesForProgram } from "@/lib/db";
import { parseCertificateBatch } from "@/lib/certificateBatch";
import { renderCertificatePdf } from "@/lib/certificateRender";
import { isFullAdmin } from "@/lib/session";

/**
 * A sample certificate, drawn from the batch that WOULD be issued.
 *
 * The list on the screen shows who and which numbers; this shows what the
 * paper actually says. Nothing is written, and the file is not recorded as a
 * download — no certificate exists yet to record it against.
 *
 * `holder=teacher` draws the teacher's wording instead of the student's, so
 * both categories can be checked before a batch goes out.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;

  const owner = (await findYearlyProgramById(id)) ?? (await findCourseById(id));
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = parseCertificateBatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const wanted = (body as { holder?: unknown }).holder === "teacher" ? "teacher" : "student";
  const { rows } = await planCertificatesForProgram({ programId: id, ...parsed.value });
  // That holder may not be on this roster at all — fall back rather than 404,
  // since the point is to see the wording.
  const row = rows.find((one) => one.holder === wanted) ?? rows[0];
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Сертификат үүсэх хүн алга байна" },
      { status: 400 }
    );
  }

  const pdfBytes = await renderCertificatePdf({ ...row, id: "preview", createdAt: "" });
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: this is for looking at, not filing away.
      "Content-Disposition": `inline; filename="turshilt-${row.certificateNumber}.pdf"`,
    },
  });
}
