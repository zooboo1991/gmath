import { NextResponse } from "next/server";
import { getNextProblem, getPickingState, listProblems, recordProblemAction } from "@/lib/assessment/db";
import { PROBLEMS_TO_SOLVE } from "@/lib/assessment/config";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";
import { toPublicProblem, type ProblemAction } from "@/lib/assessment/types";

const ACTIONS: ProblemAction[] = ["too_easy", "dont_know", "solving"];

/**
 * Records what the student chose for the problem in front of them, then hands
 * back the next one — one round trip per card instead of two.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const step = requireStatus(guard.assessment, ["questionnaire_done"]);
  if (!step.ok) {
    return NextResponse.json({ ok: false, error: step.error }, { status: step.status });
  }

  const data = await request.json();
  const action = data.action as ProblemAction;
  const problemId = typeof data.problemId === "string" ? data.problemId : "";
  if (!ACTIONS.includes(action) || !problemId) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const before = await getPickingState(guard.assessment);
  // Already finished: accepting more would let a student pick 20 problems to
  // solve by replaying the request.
  if (before.finished) {
    return NextResponse.json({ ok: false, error: "Бодлого сонгож дууссан байна" }, { status: 409 });
  }
  // The problem must be one that actually exists and is still active.
  const known = (await listProblems()).some((p) => p.id === problemId);
  if (!known) {
    return NextResponse.json({ ok: false, error: "Бодлого олдсонгүй" }, { status: 404 });
  }
  // shownOrder comes from the server's own count, never from the client.
  try {
    await recordProblemAction(guard.assessment.id, problemId, action, before.shown.length + 1);
  } catch (err) {
    // unique(assessment_id, problem_id) — a double-submitted answer.
    if ((err as { code?: string } | null)?.code === "23505") {
      return NextResponse.json({ ok: false, error: "Энэ бодлогод аль хэдийн хариулсан байна" }, { status: 409 });
    }
    throw err;
  }

  const after = await getPickingState(guard.assessment);
  const problem = after.finished ? null : await getNextProblem(guard.assessment);

  return NextResponse.json({
    ok: true,
    problem: problem ? toPublicProblem(problem) : null,
    chosen: after.chosen.length,
    needed: PROBLEMS_TO_SOLVE,
    finished: after.finished || problem === null,
  });
}
