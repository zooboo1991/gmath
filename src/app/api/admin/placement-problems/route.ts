import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/adminLog";
import {
  createPlacementProblem,
  listPlacementProblems,
} from "@/lib/assessment/placementDb";
import { validatePlacementProblemInput } from "@/lib/assessment/validatePlacementProblem";
import { isFullAdmin } from "@/lib/session";

/** Шаталсан түвшин тогтоолтын бодлогын сан. Зөвхөн эзний эрх. */
export async function GET(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const gradeParam = new URL(request.url).searchParams.get("grade");
  const grade = gradeParam ? Number(gradeParam) : undefined;
  const problems = await listPlacementProblems({
    grade: Number.isInteger(grade) ? grade : undefined,
  });
  return NextResponse.json({ ok: true, problems });
}

export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const result = validatePlacementProblemInput(data);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  try {
    const problem = await createPlacementProblem(result.value);
    await logAdminAction(request, {
      actionType: "placement.problem_create",
      targetId: problem.id,
      details: { grade: problem.grade, topicOrder: problem.topicOrder, level: problem.level },
    });
    return NextResponse.json({ ok: true, problem });
  } catch (err) {
    // (grade, topic_order, level) гурвалд нэг л бодлого — давхардлыг
    // ойлгомжтой хэлнэ.
    if ((err as { code?: string }).code === "23505") {
      return NextResponse.json(
        { ok: false, error: "Энэ анги, сэдэв, түвшинд бодлого аль хэдийн байна" },
        { status: 409 }
      );
    }
    throw err;
  }
}
