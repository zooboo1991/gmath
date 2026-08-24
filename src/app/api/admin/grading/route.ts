import { NextResponse } from "next/server";
import { listAssessmentsForGrading, listCompletedAssessments } from "@/lib/assessment/db";
import { REFUSED, requireCapability } from "@/lib/adminAccess";

export async function GET() {
  if (!(await requireCapability("grading")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const [queue, completed] = await Promise.all([
    listAssessmentsForGrading(),
    listCompletedAssessments(),
  ]);
  return NextResponse.json({ ok: true, queue, completed });
}
