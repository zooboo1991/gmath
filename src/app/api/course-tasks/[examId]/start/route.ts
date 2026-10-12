import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { startCourseTask } from "@/lib/courseTasks";

/**
 * A student opening one of their course's homework or test papers: their
 * sitting (new and free, or the one they already started), which the client
 * then solves at /assessment/{id}/solve like any exam.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  const result = await startCourseTask((await params).examId, user.id);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, assessmentId: result.assessmentId });
}
