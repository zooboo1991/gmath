import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { findExamDetail, setExamProblems, updateExam } from "@/lib/assessment/exams";

const REFUSED = { ok: false, error: "Зөвшөөрөлгүй" };
const NOT_FOUND = { ok: false, error: "Даалгавар олдсонгүй" };

async function loadTask(examId: string) {
  const exam = await findExamDetail(examId);
  return exam && exam.kind !== "placement" ? exam : undefined;
}

/**
 * One homework/test paper: its name, window, problems and whether it is open.
 * Saved as a whole, like an exam. A paper with children's work on it keeps its
 * problems — changing them would mark a child against problems they never saw.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  if (!(await isFullAdmin())) return NextResponse.json(REFUSED, { status: 401 });
  const { examId } = await params;
  const task = await loadTask(examId);
  if (!task) return NextResponse.json(NOT_FOUND, { status: 404 });
  const data = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const title = typeof data.title === "string" ? data.title.trim() : task.title;
  if (!title || title.length > 160) {
    return NextResponse.json({ ok: false, error: "Нэрээ оруулна уу (160 тэмдэгтээс ихгүй)" }, { status: 400 });
  }
  const opensAt = data.opensAt === undefined ? task.opensAt : typeof data.opensAt === "string" ? data.opensAt : "";
  const closesAt = data.closesAt === undefined ? task.closesAt : typeof data.closesAt === "string" ? data.closesAt : "";
  const opens = new Date(opensAt ?? "");
  const closes = new Date(closesAt ?? "");
  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime()) || opens >= closes) {
    return NextResponse.json({ ok: false, error: "Нээгдэх цаг хаагдах цагаас өмнө байх ёстой" }, { status: 400 });
  }
  const status = data.status === undefined ? task.status : data.status;
  if (status !== "draft" && status !== "open" && status !== "closed") {
    return NextResponse.json({ ok: false, error: "Төлөв буруу байна" }, { status: 400 });
  }

  let problemIds: string[] | undefined;
  if (data.problemIds !== undefined) {
    if (!Array.isArray(data.problemIds) || data.problemIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ ok: false, error: "Бодлогын жагсаалт буруу байна" }, { status: 400 });
    }
    problemIds = [...new Set(data.problemIds as string[])];
    const same = problemIds.join(",") === task.problems.map((p) => p.id).join(",");
    if (!same) {
      const { count, error } = await getSupabase()
        .from("assessments")
        .select("id", { count: "exact", head: true })
        .eq("exam_id", examId)
        .neq("status", "cancelled");
      if (error) throw error;
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { ok: false, error: "Хүүхдүүд энэ даалгаврыг бодож эхэлсэн тул бодлогыг нь солих боломжгүй" },
          { status: 409 }
        );
      }
      if (problemIds.length > 0) {
        const { data: found, error: findError } = await getSupabase().from("problems").select("id").in("id", problemIds);
        if (findError) throw findError;
        if ((found ?? []).length !== problemIds.length) {
          return NextResponse.json({ ok: false, error: "Олдохгүй бодлого сонгогдсон байна" }, { status: 400 });
        }
      }
    }
  }
  const problemCount = problemIds?.length ?? task.problems.length;
  if (status === "open" && problemCount === 0) {
    return NextResponse.json({ ok: false, error: "Нээхийн өмнө бодлого сонгоно уу" }, { status: 400 });
  }

  if (problemIds && problemIds.join(",") !== task.problems.map((p) => p.id).join(",")) await setExamProblems(examId, problemIds);
  await updateExam(examId, { title, status });
  const { error: timeError } = await getSupabase()
    .from("exams")
    .update({ opens_at: opens.toISOString(), closes_at: closes.toISOString() })
    .eq("id", examId);
  if (timeError) throw timeError;

  await logAdminAction(request, {
    actionType: "course.task_update",
    targetId: examId,
    details: { title, status, problems: problemCount, opensAt: opens.toISOString(), closesAt: closes.toISOString() },
  });
  return NextResponse.json({ ok: true, task: await loadTask(examId) });
}

/**
 * Removes a paper made by mistake — a week the course skips, a timetable line
 * typed twice. Only while no child has a sitting on it, cancelled ones
 * included: a sitting is a record of the child's work and keeps its paper.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  if (!(await isFullAdmin())) return NextResponse.json(REFUSED, { status: 401 });
  const { examId } = await params;
  const task = await loadTask(examId);
  if (!task) return NextResponse.json(NOT_FOUND, { status: 404 });
  const { count, error } = await getSupabase()
    .from("assessments")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);
  if (error) throw error;
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: "Хүүхдүүд энэ даалгаврыг эхлүүлсэн тул устгах боломжгүй. «Нооргоор болгох»-оор хаана уу." },
      { status: 409 }
    );
  }
  const { error: deleteError } = await getSupabase().from("exams").delete().eq("id", examId);
  if (deleteError) throw deleteError;
  await logAdminAction(request, {
    actionType: "course.task_delete",
    targetId: examId,
    details: { title: task.title, programId: task.programId },
  });
  return NextResponse.json({ ok: true });
}
