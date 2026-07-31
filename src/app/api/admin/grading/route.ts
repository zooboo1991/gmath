import { NextResponse } from "next/server";
import { listAssessmentsForGrading, listCompletedAssessments } from "@/lib/assessment/db";
import { isAdmin } from "@/lib/session";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const [queue, completed] = await Promise.all([
    listAssessmentsForGrading(),
    listCompletedAssessments(),
  ]);
  return NextResponse.json({ ok: true, queue, completed });
}
