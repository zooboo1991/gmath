import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { findOlympiad } from "@/lib/miniOlympiad/db";
import { olympiadPeople } from "@/lib/miniOlympiad/view";
import { matchNames, OlympiadImportError, parseOlympiadWorkbook } from "@/lib/miniOlympiad/import";

const MAX_SIZE = 4 * 1024 * 1024;

/**
 * Reads a graded workbook and matches each row to a registered child. Saves
 * nothing: the admin checks the matches, fixes any, and saves through
 * POST /results.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const olympiad = await findOlympiad((await params).id);
  if (!olympiad) return NextResponse.json({ ok: false, error: "Олимпиад олдсонгүй" }, { status: 404 });

  const form = (request.headers.get("content-type") ?? "").includes("multipart/form-data")
    ? await request.formData().catch(() => null)
    : null;
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Excel файлаа сонгоно уу" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "Файл 4MB-аас ихгүй байх ёстой" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseOlympiadWorkbook(new Uint8Array(await file.arrayBuffer()), olympiad.problemCount);
  } catch (err) {
    const message = err instanceof OlympiadImportError ? err.message : "Excel файлыг уншиж чадсангүй";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  const { rows, hasComments, hasNotes } = parsed;
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Файлд сурагчийн дүн олдсонгүй" }, { status: 400 });
  }
  const tooHigh = rows.find((r) => r.scores.some((s) => s !== null && (s < 0 || s > olympiad.maxPerProblem)));
  if (tooHigh) {
    return NextResponse.json(
      { ok: false, error: `${tooHigh.name}: оноо 0–${olympiad.maxPerProblem} хооронд байх ёстой` },
      { status: 400 }
    );
  }
  const roster = await olympiadPeople(olympiad);
  return NextResponse.json({ ok: true, rows: matchNames(rows, roster), hasComments, hasNotes });
}
