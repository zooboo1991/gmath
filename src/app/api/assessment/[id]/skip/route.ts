import { NextResponse } from "next/server";
import { getPickingState, listSolutions, setProblemSkipped } from "@/lib/assessment/db";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";

/**
 * "Бодож чадсангүй" — the child could not solve this one and moves on.
 *
 * Recorded rather than skipped over in the browser, so leaving the page and
 * coming back lands on the next problem instead of the one they gave up on.
 * A skipped problem needs no photo, which is what lets a paper of ten be
 * submitted with nine.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const step = requireStatus(guard.assessment, ["questionnaire_done"]);
  if (!step.ok) {
    return NextResponse.json({ ok: false, error: "Бодолт илгээгдсэн байна" }, { status: 409 });
  }

  const data = await request.json().catch(() => ({}));
  const problemId = typeof data.problemId === "string" ? data.problemId : "";
  const skipped = data.skipped !== false;

  const state = await getPickingState(guard.assessment);
  if (!state.shown.some((entry) => entry.problemId === problemId)) {
    return NextResponse.json({ ok: false, error: "Энэ бодлого таных биш байна" }, { status: 400 });
  }

  // Changing their mind is allowed while the paper is still open — but not if
  // they have already photographed it, since that answer is the better one.
  if (skipped) {
    const solution = (await listSolutions(id)).find((s) => s.problemId === problemId);
    if ((solution?.imagePaths.length ?? 0) > 0) {
      return NextResponse.json(
        { ok: false, error: "Энэ бодлогод зураг оруулсан байна." },
        { status: 409 }
      );
    }
  }

  await setProblemSkipped(id, problemId, skipped);
  return NextResponse.json({ ok: true });
}
