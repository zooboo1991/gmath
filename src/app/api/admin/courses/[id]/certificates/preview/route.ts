import { NextResponse } from "next/server";
import { findCourseById, findYearlyProgramById, planCertificatesForProgram } from "@/lib/db";
import { parseCertificateBatch } from "@/lib/certificateBatch";
import { isFullAdmin } from "@/lib/session";

/**
 * What an issuing run WOULD create — nothing is written.
 *
 * Certificates are a statement the school makes, the numbers continue from
 * the last batch, and there is no "undo" on the screen. Looking first is the
 * cheapest way to catch a typo in the course letter or a wrong class name,
 * which otherwise ends up printed on every child's certificate.
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

  const parsed = parseCertificateBatch(await request.json().catch(() => ({})));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { rows, skipped } = await planCertificatesForProgram({ programId: id, ...parsed.value });
  return NextResponse.json({ ok: true, rows, skipped });
}
