import { NextResponse } from "next/server";
import { getPickingState, listSolutions, updateAssessment } from "@/lib/assessment/db";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";

/** Hands the work over to the graders. One-way. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const step = requireStatus(guard.assessment, ["questionnaire_done"]);
  if (!step.ok) {
    return NextResponse.json({ ok: false, error: "Аль хэдийн илгээгдсэн байна" }, { status: 409 });
  }

  const state = await getPickingState(guard.assessment);
  if (state.chosen.length === 0) {
    return NextResponse.json({ ok: false, error: "Бодох бодлого сонгоогүй байна" }, { status: 400 });
  }

  // Every chosen problem needs at least one photo, otherwise a grader opens
  // the submission to find nothing to mark.
  const solutions = await listSolutions(id);
  const missing = state.chosen.filter((c) => {
    const s = solutions.find((x) => x.problemId === c.problemId);
    return !s || s.imagePaths.length === 0;
  });
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `${missing.length} бодлогын бодолт дутуу байна` },
      { status: 400 }
    );
  }

  const assessment = await updateAssessment(id, { status: "problems_submitted" });
  return NextResponse.json({ ok: true, assessment });
}
