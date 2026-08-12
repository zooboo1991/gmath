import { NextResponse } from "next/server";
import { updateQuizQuestion } from "@/lib/assessment/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
import { validateQuizQuestionInput } from "@/lib/assessment/validateQuizQuestion";

/**
 * Edit or archive (active=false) a question. No DELETE on purpose: quiz_answers
 * references the question with on delete restrict, so history stays intact —
 * same soft-delete story as the olympiad problem bank.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json().catch(() => null);

  // A bare {active} toggle skips content validation — archiving a question
  // whose text the admin never touched must not fail on that text.
  if (data && typeof data.active === "boolean" && Object.keys(data).length === 1) {
    const question = await updateQuizQuestion(id, { active: data.active });
    if (!question) return NextResponse.json({ ok: false, error: "Асуулт олдсонгүй" }, { status: 404 });
    await logAdminAction(request, { actionType: "quiz_question.update", targetId: id });
    return NextResponse.json({ ok: true, question });
  }

  const parsed = validateQuizQuestionInput(data);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const question = await updateQuizQuestion(id, parsed.value);
  if (!question) {
    return NextResponse.json({ ok: false, error: "Асуулт олдсонгүй" }, { status: 404 });
  }
  await logAdminAction(request, { actionType: "quiz_question.update", targetId: id });
  return NextResponse.json({ ok: true, question });
}
