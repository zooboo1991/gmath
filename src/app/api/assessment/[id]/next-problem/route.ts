import { NextResponse } from "next/server";
import { getNextProblem, getPickingState } from "@/lib/assessment/db";
import { PROBLEMS_TO_SOLVE } from "@/lib/assessment/config";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";
import { toPublicProblem } from "@/lib/assessment/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const step = requireStatus(guard.assessment, ["questionnaire_done"]);
  if (!step.ok) {
    return NextResponse.json({ ok: false, error: step.error }, { status: step.status });
  }

  const state = await getPickingState(guard.assessment);
  const problem = await getNextProblem(guard.assessment);

  return NextResponse.json({
    ok: true,
    // toPublicProblem strips answerKey — a student must never receive it.
    problem: problem ? toPublicProblem(problem) : null,
    chosen: state.chosen.length,
    needed: PROBLEMS_TO_SOLVE,
    // Either enough problems are chosen, or the bank ran out of new ones.
    finished: state.finished || problem === null,
  });
}
