import { NextResponse } from "next/server";
import { createAssessment, findOpenAssessment, getAssessmentFee } from "@/lib/assessment/db";
import { getSessionUser } from "@/lib/session";

/** The assessment the student is part-way through, if any. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  const [assessment, fee] = await Promise.all([findOpenAssessment(user.id), getAssessmentFee()]);
  return NextResponse.json({ ok: true, assessment: assessment ?? null, fee });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  // Resuming beats starting over: a second tab, or a refresh mid-flow, must
  // not leave the student with two half-finished assessments (and two fees).
  const existing = await findOpenAssessment(user.id);
  if (existing) {
    return NextResponse.json({ ok: true, assessment: existing, resumed: true });
  }

  const fee = await getAssessmentFee();
  const assessment = await createAssessment(user.id, fee);
  return NextResponse.json({ ok: true, assessment, resumed: false });
}
