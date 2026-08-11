import { NextResponse } from "next/server";
import { deactivateProblem, listProblems, updateProblem } from "@/lib/assessment/db";
import { hasProblemContent, validateProblemInput } from "@/lib/assessment/validateProblem";
import { isFullAdmin } from "@/lib/session";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json();

  const result = validateProblemInput(data, { partial: true });
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // A partial edit could empty the last remaining field, so check the merged
  // result rather than only what was sent.
  const existing = (await listProblems({ includeInactive: true })).find((p) => p.id === id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Бодлого олдсонгүй" }, { status: 404 });
  }
  const mergedBody = result.value.bodyLatex ?? existing.bodyLatex;
  const mergedImage = result.value.imageUrl ?? existing.imageUrl;
  if (!hasProblemContent(mergedBody, mergedImage)) {
    return NextResponse.json(
      { ok: false, error: "Бодлогын эх (LaTeX) эсвэл зургийн аль нэгийг оруулна уу" },
      { status: 400 }
    );
  }

  const problem = await updateProblem(id, result.value);
  if (!problem) {
    return NextResponse.json({ ok: false, error: "Бодлого олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, problem });
}

/**
 * Soft delete. Assessments that already showed this problem keep referencing
 * it (the FK is ON DELETE RESTRICT), so it is only hidden from new ones.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deactivateProblem(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Бодлого олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
