import { NextResponse } from "next/server";
import { createAssessment, findOpenAssessment, getFeeForTrack } from "@/lib/assessment/db";
import { findOpenExam, isFreeForUser, listFreeInvitedExams } from "@/lib/assessment/exams";
import { ASSESSMENT_CLOSED, canUseAssessment } from "@/lib/assessment/guard";
import {
  categoryForGrade,
  isProblemCategory,
  parseGrade,
  type AssessmentTrack,
  type ProblemCategory,
} from "@/lib/assessment/types";
import { getSessionUser } from "@/lib/session";

/** The assessment the student is part-way through, if any. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  if (!(await canUseAssessment(user))) {
    return NextResponse.json({ ok: false, error: ASSESSMENT_CLOSED.error }, { status: ASSESSMENT_CLOSED.status });
  }
  // ?exam=<id> comes from the course card the child pressed. Without it the
  // page would resume whichever assessment happened to be open — the wrong
  // exam, for a child invited to two.
  const wantedExam = new URL(request.url).searchParams.get("exam") ?? undefined;
  const assessment = await findOpenAssessment(user.id, wantedExam);
  // The fee shown up front is the open assessment's own track, or the price
  // list for the track picker when nothing is in progress.
  const [assessmentFee, quizFee, invitedExams] = await Promise.all([
    getFeeForTrack("olympiad"),
    getFeeForTrack("regular"),
    listFreeInvitedExams(user.id).catch(() => []),
  ]);
  return NextResponse.json({
    ok: true,
    assessment: assessment ?? null,
    fee: assessment?.track === "regular" || assessment?.track === "advanced" ? quizFee : assessmentFee,
    fees: { olympiad: assessmentFee, quiz: quizFee },
    // A child whose class was invited has an exam waiting, so the page can
    // take them to it instead of asking which of three kinds they want. Two
    // programmes means two invitations, and the page picks by ?exam=.
    invitedExams: invitedExams.map((e) => ({ id: e.id, title: e.title })),
  });
}

const TRACKS: AssessmentTrack[] = ["regular", "advanced", "olympiad"];

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  if (!(await canUseAssessment(user))) {
    return NextResponse.json({ ok: false, error: ASSESSMENT_CLOSED.error }, { status: ASSESSMENT_CLOSED.status });
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

  // An invitation outranks everything below: the teacher named this child's
  // course on an exam, so that exam is theirs whatever their school year says.
  // A C-programme class holds a fourth grader and a ninth grader, both placed
  // there on ability, and both are meant to sit it.
  const invitations = track === "olympiad" ? await listFreeInvitedExams(user.id) : [];
  // The exam the child pressed on, when they were invited to more than one.
  const invitedExam =
    (typeof data?.examId === "string" ? invitations.find((e) => e.id === data.examId) : undefined) ??
    invitations[0];

  // Otherwise the bank is split by category: C is 5th-6th grade, D is 7th-8th.
  // Taken from the profile, because that is the answer the family already
  // gave; only when the grade falls outside 5-8 (or is missing) does the
  // student get asked, and then it must come with the request.
  let category: ProblemCategory | undefined;
  if (track === "olympiad") {
    category =
      invitedExam?.category ??
      categoryForGrade(parseGrade(user.grade)) ??
      (isProblemCategory(data?.category) ? data.category : undefined);
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
  const existing = await findOpenAssessment(user.id, invitedExam?.id);
  if (existing) {
    return NextResponse.json({ ok: true, assessment: existing, resumed: true });
  }

  // Olympiad: the child sits the exam the teacher has open for their category,
  // at that exam's price — or free, if the teacher put them on its list.
  if (track === "olympiad" && category) {
    const exam = invitedExam ?? (await findOpenExam(category));
    if (!exam) {
      return NextResponse.json(
        { ok: false, error: "Одоогоор нээлттэй шалгалт алга байна. Дараа дахин оролдоно уу." },
        { status: 409 }
      );
    }
    const free = await isFreeForUser(exam.id, user.id);
    const assessment = await createAssessment(
      user.id,
      free ? "0₮" : exam.fee,
      track,
      quizGrade,
      category,
      exam.id
    );
    return NextResponse.json({ ok: true, assessment, resumed: false, exam, free });
  }

  const fee = await getFeeForTrack(track);
  const assessment = await createAssessment(user.id, fee, track, quizGrade, category);
  return NextResponse.json({ ok: true, assessment, resumed: false });
}
