import { NextResponse } from "next/server";
import { findAssessment, findLevel, updateAssessment } from "@/lib/assessment/db";
import { isTooLong, MAX_LEN } from "@/lib/validate";
import { REFUSED, requireCapability } from "@/lib/adminAccess";

/** The teacher's final call: the written verdict that closes the marking. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("grading")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }

  const data = await request.json();
  // The numbered level is off the form for now — the scale is not settled, and
  // a teacher was being made to pick one to finish marking. What the family
  // reads is the written verdict and the per-problem scores. A level sent by
  // an older client is still honoured, so nothing already graded loses it.
  const finalLevel = Number(data.finalLevel);
  const level =
    Number.isInteger(finalLevel) && finalLevel >= 1 && finalLevel <= 10
      ? (await findLevel(finalLevel))
        ? finalLevel
        : undefined
      : undefined;

  const teacherComment = typeof data.teacherComment === "string" ? data.teacherComment.trim() : "";
  if (!teacherComment) {
    return NextResponse.json({ ok: false, error: "Багшийн дүгнэлтийг бөглөнө үү" }, { status: 400 });
  }
  if (isTooLong(teacherComment, MAX_LEN.articleExcerpt)) {
    return NextResponse.json({ ok: false, error: "Дүгнэлт хэт урт байна" }, { status: 400 });
  }

  const updated = await updateAssessment(id, {
    ...(level === undefined ? {} : { final_level: level }),
    teacher_comment: teacherComment,
    status: "completed",
  });
  return NextResponse.json({ ok: true, assessment: updated });
}
