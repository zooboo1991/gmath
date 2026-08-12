import { NextResponse } from "next/server";
import { getOrAssembleQuiz } from "@/lib/assessment/db";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";
import { toPublicQuizQuestion } from "@/lib/assessment/types";

/**
 * The attempt's question set — assembled on first call, replayed on every
 * later one so a refresh resumes the same test. Only for a paid quiz-track
 * assessment; the olympiad track never reaches this route.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  if (guard.assessment.track === "olympiad") {
    return NextResponse.json({ ok: false, error: "Энэ үнэлгээ тест хэлбэрийнх биш" }, { status: 409 });
  }
  const step = requireStatus(guard.assessment, ["paid"]);
  if (!step.ok) {
    return NextResponse.json({ ok: false, error: step.error }, { status: step.status });
  }

  const { questions } = await getOrAssembleQuiz(guard.assessment);
  if (questions.length === 0) {
    // The bank has nothing for this grade yet. An honest message beats an
    // empty test — the student has paid, so tell them we'll follow up.
    return NextResponse.json(
      { ok: false, error: "Энэ ангийн тест бэлтгэгдэж байна. Бид тантай удахгүй холбогдоно." },
      { status: 503 }
    );
  }

  // toPublicQuizQuestion strips correctIndex — the key never leaves the server.
  return NextResponse.json({ ok: true, questions: questions.map(toPublicQuizQuestion) });
}
