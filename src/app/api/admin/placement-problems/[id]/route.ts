import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/adminLog";
import {
  deletePlacementProblem,
  findPlacementProblem,
  updatePlacementProblem,
} from "@/lib/assessment/placementDb";
import { validatePlacementProblemInput } from "@/lib/assessment/validatePlacementProblem";
import { isFullAdmin } from "@/lib/session";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await findPlacementProblem(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Бодлого олдсонгүй" }, { status: 404 });
  }

  const data = await request.json().catch(() => ({}));
  const result = validatePlacementProblemInput({ ...existing, ...data });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  try {
    const problem = await updatePlacementProblem(id, result.value);
    await logAdminAction(request, {
      actionType: "placement.problem_update",
      targetId: id,
      details: { grade: result.value.grade, topicOrder: result.value.topicOrder, level: result.value.level },
    });
    return NextResponse.json({ ok: true, problem });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return NextResponse.json(
        { ok: false, error: "Энэ анги, сэдэв, түвшинд бодлого аль хэдийн байна" },
        { status: 409 }
      );
    }
    throw err;
  }
}

/**
 * Жинхэнэ устгал, архив биш: ноорог бодлого олон удаа засагдаж, орлуулагддаг.
 * Шалгалтад аль хэдийн ашиглагдсан бодлогыг placement_steps-ийн FK хамгаална —
 * тэр үед 409 гарна.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deletePlacementProblem(id);
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return NextResponse.json(
        { ok: false, error: "Энэ бодлогоор шалгалт өгсөн түүх байгаа тул устгах боломжгүй. Идэвхгүй болгоно уу." },
        { status: 409 }
      );
    }
    throw err;
  }
  await logAdminAction(request, { actionType: "placement.problem_delete", targetId: id });
  return NextResponse.json({ ok: true });
}
