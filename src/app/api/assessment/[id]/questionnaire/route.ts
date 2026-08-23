import { NextResponse } from "next/server";
import { attachProblems, saveQuestionnaire } from "@/lib/assessment/db";
import { listExamProblems } from "@/lib/assessment/exams";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";
import { isTooLong, MAX_LEN } from "@/lib/validate";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  // Re-submitting is allowed while still on this step (the student may go
  // back and correct an answer), but the fee has to be paid first.
  const step = requireStatus(guard.assessment, ["paid", "questionnaire_done"]);
  if (!step.ok) {
    return NextResponse.json({ ok: false, error: step.error }, { status: step.status });
  }

  const data = await request.json();
  const grade = typeof data.grade === "string" ? data.grade.trim() : "";
  if (!grade) {
    return NextResponse.json({ ok: false, error: "Ангиа сонгоно уу" }, { status: 400 });
  }

  const age = data.age === "" || data.age === null || data.age === undefined ? undefined : Number(data.age);
  if (age !== undefined && (!Number.isInteger(age) || age < 5 || age > 25)) {
    return NextResponse.json({ ok: false, error: "Насаа зөв оруулна уу" }, { status: 400 });
  }

  const achievements = typeof data.achievements === "string" ? data.achievements.trim() : "";
  if (isTooLong(achievements, MAX_LEN.levelText)) {
    return NextResponse.json({ ok: false, error: "Амжилтын тайлбар хэт урт байна" }, { status: 400 });
  }

  const { estimatedLevel } = await saveQuestionnaire(id, {
    age,
    grade,
    hasCompeted: data.hasCompeted === true,
    hasPrepared: data.hasPrepared === true,
    achievements,
  });

  // The exam's problems become this child's paper, in the teacher's order.
  if (guard.assessment.examId) {
    const problems = await listExamProblems(guard.assessment.examId);
    await attachProblems(id, problems.map((p) => p.id));
  }

  return NextResponse.json({ ok: true, estimatedLevel });
}
