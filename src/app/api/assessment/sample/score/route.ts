import { NextResponse } from "next/server";
import { listQuizQuestions } from "@/lib/assessment/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isAssessmentOpen } from "@/lib/assessment/db";
import { ASSESSMENT_CLOSED } from "@/lib/assessment/guard";

/**
 * Scores the free taster.
 *
 * The client sends {questionId: chosenIndex} and gets back a count and a
 * suggestion — never which questions were wrong, and never the key. Grading on
 * the server is the point: a taster whose answers sit in the page source is
 * worth nothing as a signal, and these same questions are the ones a parent
 * uses to judge whether to pay.
 *
 * Nothing is stored. An anonymous visitor's five taps are not worth a table,
 * and the paid assessment is where a record starts to matter.
 */
export async function POST(request: Request) {
  // The taster is the one assessment surface with no session behind it, so the
  // closed check has to be here rather than in requireOwnAssessment.
  if (!(await isAssessmentOpen())) {
    return NextResponse.json({ ok: false, error: ASSESSMENT_CLOSED.error }, { status: ASSESSMENT_CLOSED.status });
  }

  const { allowed } = await checkRateLimit(`samplescore:${getClientIp(request.headers)}`, 30, 60);
  if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const data = await request.json().catch(() => null);
  const raw = data?.answers;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ ok: false, error: "Хариулт хоосон байна" }, { status: 400 });
  }

  const ids = Object.keys(raw as Record<string, unknown>).slice(0, 20);
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "Хариулт хоосон байна" }, { status: 400 });
  }

  // Only sample questions can be scored here — this endpoint must never become
  // a way to read the key of a paid question.
  const questions = (await listQuizQuestions({ activeOnly: true, sample: true })).filter((q) =>
    ids.includes(q.id)
  );
  if (questions.length === 0) {
    return NextResponse.json({ ok: false, error: "Асуулт олдсонгүй" }, { status: 404 });
  }

  let score = 0;
  const wrongTopics: string[] = [];
  for (const q of questions) {
    const pick = (raw as Record<string, unknown>)[q.id];
    if (typeof pick === "number" && pick === q.correctIndex) score += 1;
    else if (q.topic) wrongTopics.push(q.topic);
  }

  return NextResponse.json({
    ok: true,
    score,
    total: questions.length,
    // Topics only, no per-question verdict: enough to be useful, not enough to
    // reverse-engineer the key one request at a time.
    wrongTopics: [...new Set(wrongTopics)],
  });
}
