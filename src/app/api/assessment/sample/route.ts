import { NextResponse } from "next/server";
import { listQuizQuestions } from "@/lib/assessment/db";
import { SAMPLE_QUESTIONS_PER_TEST } from "@/lib/assessment/config";
import { toPublicQuizQuestion, type QuizTrack } from "@/lib/assessment/types";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * The free taster's questions. No session, no payment — this is the thing a
 * parent can try before deciding, which is why it deliberately has no gate.
 *
 * Only questions the admin flagged as samples are served, and the paid test
 * excludes exactly those, so trying this can never spoil a real attempt.
 * toPublicQuizQuestion drops correctIndex; the answer key never leaves here.
 */
export async function GET(request: Request) {
  const { allowed } = await checkRateLimit(`sample:${getClientIp(request.headers)}`, 30, 60);
  if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const url = new URL(request.url);
  const grade = Number(url.searchParams.get("grade"));
  const trackParam = url.searchParams.get("track");
  const track: QuizTrack = trackParam === "advanced" ? "advanced" : "regular";

  if (!Number.isInteger(grade) || grade < 1 || grade > 12) {
    return NextResponse.json({ ok: false, error: "Анги буруу байна" }, { status: 400 });
  }

  const bank = await listQuizQuestions({ track, grade, activeOnly: true, sample: true });
  if (bank.length === 0) {
    // No taster written for this grade yet. The UI hides the section rather
    // than showing an empty test.
    return NextResponse.json({ ok: true, questions: [] });
  }

  const picked = [...bank].sort(() => Math.random() - 0.5).slice(0, SAMPLE_QUESTIONS_PER_TEST);
  return NextResponse.json({ ok: true, questions: picked.map(toPublicQuizQuestion) });
}
