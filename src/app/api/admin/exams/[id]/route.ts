import { NextResponse } from "next/server";
import {
  deleteExam,
  findExam,
  findExamDetail,
  listExamProblems,
  setExamFreeCourses,
  setExamProblems,
  updateExam,
} from "@/lib/assessment/exams";
import { isProblemCategory } from "@/lib/assessment/types";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const detail = await findExamDetail((await params).id);
  if (!detail) return NextResponse.json({ ok: false, error: "Шалгалт олдсонгүй" }, { status: 404 });
  return NextResponse.json({ ok: true, exam: detail });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await findExam(id);
  if (!existing) return NextResponse.json({ ok: false, error: "Шалгалт олдсонгүй" }, { status: 404 });

  const data = await request.json().catch(() => ({}));
  const patch: Parameters<typeof updateExam>[1] = {};

  if (data.title !== undefined) {
    const title = typeof data.title === "string" ? data.title.trim() : "";
    if (!title) return NextResponse.json({ ok: false, error: "Нэрээ бичнэ үү" }, { status: 400 });
    if (isTooLong(title, MAX_LEN.courseTitle)) {
      return NextResponse.json({ ok: false, error: "Нэр хэт урт байна" }, { status: 400 });
    }
    patch.title = title;
  }
  if (data.category !== undefined) {
    if (!isProblemCategory(data.category)) {
      return NextResponse.json({ ok: false, error: "Ангилал буруу байна" }, { status: 400 });
    }
    patch.category = data.category;
  }
  if (data.fee !== undefined) {
    const fee = typeof data.fee === "string" ? data.fee.trim() : "";
    if (isTooLong(fee, MAX_LEN.coursePrice)) {
      return NextResponse.json({ ok: false, error: "Төлбөр хэт урт байна" }, { status: 400 });
    }
    patch.fee = fee || "0₮";
  }
  if (data.status !== undefined) {
    if (!["draft", "open", "closed"].includes(data.status)) {
      return NextResponse.json({ ok: false, error: "Төлөв буруу байна" }, { status: 400 });
    }
    // Opening an empty exam would send a child to a test with nothing in it.
    // Checked against the problems arriving in THIS request when there are
    // any — the editor saves the roll and opens the exam in one call, and
    // reading the stored list here would judge it on its previous contents.
    if (data.status === "open") {
      const incoming = Array.isArray(data.problemIds) ? data.problemIds : null;
      const count = incoming ? incoming.length : (await listExamProblems(id)).length;
      if (count === 0) {
        return NextResponse.json(
          { ok: false, error: "Бодлогогүй шалгалтыг нээх боломжгүй. Эхлээд бодлогоо сонгоно уу." },
          { status: 400 }
        );
      }
    }
    patch.status = data.status;
  }

  if (Array.isArray(data.problemIds)) {
    await setExamProblems(id, data.problemIds.filter((p: unknown): p is string => typeof p === "string"));
  }
  if (Array.isArray(data.freeCourseIds)) {
    await setExamFreeCourses(
      id,
      data.freeCourseIds.filter((c: unknown): c is string => typeof c === "string")
    );
  }
  if (Object.keys(patch).length > 0) await updateExam(id, patch);

  await logAdminAction(request, {
    actionType: "exam.update",
    targetId: id,
    details: { title: patch.title ?? existing.title, status: patch.status ?? existing.status },
  });

  return NextResponse.json({ ok: true, exam: await findExamDetail(id) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const exam = await findExam(id);
  if (!exam) return NextResponse.json({ ok: false, error: "Шалгалт олдсонгүй" }, { status: 404 });

  try {
    await deleteExam(id);
  } catch (err) {
    // A child has sat it: assessments.exam_id is ON DELETE SET NULL, so the
    // delete itself succeeds — but exam_problems restricts on the problems.
    console.error("[exam] delete failed", id, err);
    return NextResponse.json(
      { ok: false, error: "Устгаж чадсангүй. Оронд нь «Хаах» төлөвт шилжүүлнэ үү." },
      { status: 409 }
    );
  }

  await logAdminAction(request, { actionType: "exam.delete", targetId: id, details: { title: exam.title } });
  return NextResponse.json({ ok: true });
}
