import { NextResponse } from "next/server";
import { createAssessment, findOpenAssessment, getFeeForTrack, isAssessmentOpen } from "@/lib/assessment/db";
import { ASSESSMENT_CLOSED } from "@/lib/assessment/guard";
import {
  categoryForGrade,
  isProblemCategory,
  type AssessmentTrack,
  type ProblemCategory,
} from "@/lib/assessment/types";
import { getSessionUser } from "@/lib/session";

/** The assessment the student is part-way through, if any. */
export async function GET() {
  if (!(await isAssessmentOpen())) {
    return NextResponse.json({ ok: false, error: ASSESSMENT_CLOSED.error }, { status: ASSESSMENT_CLOSED.status });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  const assessment = await findOpenAssessment(user.id);
  // The fee shown up front is the open assessment's own track, or the price
  // list for the track picker when nothing is in progress.
  const [assessmentFee, quizFee] = await Promise.all([
    getFeeForTrack("olympiad"),
    getFeeForTrack("regular"),
  ]);
  return NextResponse.json({
    ok: true,
    assessment: assessment ?? null,
    fee: assessment?.track === "regular" || assessment?.track === "advanced" ? quizFee : assessmentFee,
    fees: { olympiad: assessmentFee, quiz: quizFee },
  });
}

const TRACKS: AssessmentTrack[] = ["regular", "advanced", "olympiad"];

export async function POST(request: Request) {
  if (!(await isAssessmentOpen())) {
    return NextResponse.json({ ok: false, error: ASSESSMENT_CLOSED.error }, { status: ASSESSMENT_CLOSED.status });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  // Bodyless callers predate tracks and always meant the original flow.
  const track: AssessmentTrack = TRACKS.includes(data?.track) ? data.track : "olympiad";

  let quizGrade: number | undefined;
  if (track !== "olympiad") {
    const grade = Number(data?.grade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 12) {
      return NextResponse.json({ ok: false, error: "Ангиа сонгоно уу" }, { status: 400 });
    }
    quizGrade = grade;
  }

  // The olympiad bank is split by category: C is 5th-6th grade, D is 7th-8th.
  // Taken from the profile, because that is the answer the family already
  // gave; only when the grade falls outside 5-8 (or is missing) does the
  // student get asked, and then it must come with the request.
  let category: ProblemCategory | undefined;
  if (track === "olympiad") {
    category = categoryForGrade(Number(user.grade)) ?? (isProblemCategory(data?.category) ? data.category : undefined);
    if (!category) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ангиллаа сонгоно уу (C — 5-6 анги, D — 7-8 анги).",
          needsCategory: true,
        },
        { status: 400 }
      );
    }
  }

  // Resuming beats starting over: a second tab, or a refresh mid-flow, must
  // not leave the student with two half-finished assessments (and two fees).
  const existing = await findOpenAssessment(user.id);
  if (existing) {
    return NextResponse.json({ ok: true, assessment: existing, resumed: true });
  }

  const fee = await getFeeForTrack(track);
  const assessment = await createAssessment(user.id, fee, track, quizGrade, category);
  return NextResponse.json({ ok: true, assessment, resumed: false });
}
