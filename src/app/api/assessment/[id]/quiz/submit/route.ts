import { NextResponse } from "next/server";
import { findAssessment, scoreQuiz, setQuizRecommendation } from "@/lib/assessment/db";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";
import { writeQuizRecommendation } from "@/lib/assessment/quizRecommendation";
import type { QuizTrack } from "@/lib/assessment/types";

/**
 * Scores the quiz and writes the AI зөвлөмж, in that order and synchronously:
 * the recommendation IS the result screen, so "fire and forget" would show
 * the student an empty box. scoreQuiz's conditional status flip makes a
 * double submit idempotent — the loser just reads the stored result.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    // Already completed — return the stored result so the retry is harmless.
    const current = await findAssessment(id);
    if (current?.status === "completed") {
      return NextResponse.json({ ok: true, assessment: current, repeated: true });
    }
    return NextResponse.json({ ok: false, error: step.error }, { status: step.status });
  }

  const data = await request.json().catch(() => null);
  const raw = data?.answers;
  const chosen: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [questionId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) {
        chosen[questionId] = value;
      }
    }
  }

  const result = await scoreQuiz(guard.assessment, chosen);
  if (!result.scored) {
    // Lost the double-submit race; hand back whatever the winner stored.
    const current = await findAssessment(id);
    return NextResponse.json({ ok: true, assessment: current, repeated: true });
  }

  const recommendation = await writeQuizRecommendation({
    track: guard.assessment.track as QuizTrack,
    grade: guard.assessment.quizGrade ?? 0,
    score: result.score,
    total: result.total,
    wrongTopics: result.wrongTopics,
  });
  await setQuizRecommendation(id, recommendation);

  const assessment = await findAssessment(id);
  return NextResponse.json({ ok: true, assessment });
}
