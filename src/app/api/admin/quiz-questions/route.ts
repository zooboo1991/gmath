import { NextResponse } from "next/server";
import { addQuizQuestion, listQuizQuestions } from "@/lib/assessment/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
import { validateQuizQuestionInput } from "@/lib/assessment/validateQuizQuestion";

export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, questions: await listQuizQuestions() });
}

export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json().catch(() => null);
  const parsed = validateQuizQuestionInput(data);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const question = await addQuizQuestion(parsed.value);
  await logAdminAction(request, { actionType: "quiz_question.create", targetId: question.id });
  return NextResponse.json({ ok: true, question });
}
