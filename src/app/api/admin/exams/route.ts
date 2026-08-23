import { NextResponse } from "next/server";
import { createExam, listExams } from "@/lib/assessment/exams";
import { isProblemCategory } from "@/lib/assessment/types";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, exams: await listExams() });
}

export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const fee = typeof data.fee === "string" ? data.fee.trim() : "";

  if (!title) return NextResponse.json({ ok: false, error: "Нэрээ бичнэ үү" }, { status: 400 });
  if (isTooLong(title, MAX_LEN.courseTitle)) {
    return NextResponse.json({ ok: false, error: "Нэр хэт урт байна" }, { status: 400 });
  }
  if (!isProblemCategory(data.category)) {
    return NextResponse.json({ ok: false, error: "Ангилал сонгоно уу" }, { status: 400 });
  }
  if (isTooLong(fee, MAX_LEN.coursePrice)) {
    return NextResponse.json({ ok: false, error: "Төлбөр хэт урт байна" }, { status: 400 });
  }

  // A new exam is always a draft: it has no problems yet, and an empty exam
  // shown to a child is worse than no exam at all.
  const exam = await createExam({ title, category: data.category, fee: fee || "0₮" });

  await logAdminAction(request, {
    actionType: "exam.create",
    targetId: exam.id,
    details: { title: exam.title, category: exam.category },
  });

  return NextResponse.json({ ok: true, exam });
}
