import { NextResponse } from "next/server";
import { findAssessment, findLevel, updateAssessment } from "@/lib/assessment/db";
import { isFullAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

/** The teacher's final call: a written verdict plus the level. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }

  const data = await request.json();
  const finalLevel = Number(data.finalLevel);
  if (!Number.isInteger(finalLevel) || finalLevel < 1 || finalLevel > 10) {
    return NextResponse.json({ ok: false, error: "Түвшинг 1-10 хооронд сонгоно уу" }, { status: 400 });
  }
  // The level row carries the description the student will read, so it has
  // to exist before we point them at it.
  if (!(await findLevel(finalLevel))) {
    return NextResponse.json({ ok: false, error: "Түвшин олдсонгүй" }, { status: 400 });
  }

  const teacherComment = typeof data.teacherComment === "string" ? data.teacherComment.trim() : "";
  if (!teacherComment) {
    return NextResponse.json({ ok: false, error: "Багшийн дүгнэлтийг бөглөнө үү" }, { status: 400 });
  }
  if (isTooLong(teacherComment, MAX_LEN.articleExcerpt)) {
    return NextResponse.json({ ok: false, error: "Дүгнэлт хэт урт байна" }, { status: 400 });
  }

  const updated = await updateAssessment(id, {
    final_level: finalLevel,
    teacher_comment: teacherComment,
    status: "completed",
  });
  return NextResponse.json({ ok: true, assessment: updated });
}
