import { NextResponse } from "next/server";
import { findAssessment, gradeSolution, listSolutions, updateAssessment } from "@/lib/assessment/db";
import { isFullAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

/** A grader scoring one problem's solution. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }
  if (assessment.status === "completed") {
    return NextResponse.json({ ok: false, error: "Дууссан үнэлгээг өөрчлөх боломжгүй" }, { status: 409 });
  }

  const data = await request.json();
  const solutionId = typeof data.solutionId === "string" ? data.solutionId : "";
  // The solution has to belong to THIS assessment, or a grader could score
  // another student's work by passing its id.
  if (!(await listSolutions(id)).some((s) => s.id === solutionId)) {
    return NextResponse.json({ ok: false, error: "Бодолт олдсонгүй" }, { status: 404 });
  }

  const raw = data.graderScore;
  let graderScore: number | undefined;
  if (raw !== null && raw !== undefined && raw !== "") {
    graderScore = Number(raw);
    if (!Number.isFinite(graderScore) || graderScore < 0 || graderScore > 10) {
      return NextResponse.json({ ok: false, error: "Оноо 0-10 хооронд байна" }, { status: 400 });
    }
    graderScore = Math.round(graderScore * 10) / 10;
  }

  const graderComment = typeof data.graderComment === "string" ? data.graderComment.trim() : "";
  if (isTooLong(graderComment, MAX_LEN.levelText)) {
    return NextResponse.json({ ok: false, error: "Тайлбар хэт урт байна" }, { status: 400 });
  }

  const solution = await gradeSolution(solutionId, { graderScore, graderComment });
  // First score moves the queue item out of "waiting" and into "being graded".
  if (assessment.status === "problems_submitted") {
    await updateAssessment(id, { status: "grading" });
  }
  return NextResponse.json({ ok: true, solution });
}
