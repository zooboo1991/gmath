import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { listYearlyPrograms } from "@/lib/db";
import { createOlympiad, listOlympiads } from "@/lib/miniOlympiad/db";
import { isOlympiadDate } from "@/lib/miniOlympiad/score";

/** Every olympiad, newest first. Any admin may look. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json(REFUSED, { status: 401 });
  return NextResponse.json({ ok: true, olympiads: await listOlympiads() });
}

/** A new, unpublished olympiad for one 1-year programme. Full admins and teachers. */
export async function POST(request: Request) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const data = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const programId = typeof data.programId === "string" ? data.programId : "";
  const heldOn = isOlympiadDate(data.heldOn) ? data.heldOn : "";
  const problemCount = Number(data.problemCount);
  const maxPerProblem = Number(data.maxPerProblem ?? 7);

  if (!title || title.length > 120) {
    return NextResponse.json({ ok: false, error: "Нэрээ оруулна уу (120 тэмдэгтээс ихгүй)" }, { status: 400 });
  }
  // The date orders the list, newest first — for the admin and for families.
  if (!heldOn) return NextResponse.json({ ok: false, error: "Олимпиадын огноог оруулна уу" }, { status: 400 });
  const programs = await listYearlyPrograms();
  if (!programs.some((p) => p.id === programId)) {
    return NextResponse.json({ ok: false, error: "Хөтөлбөрөө сонгоно уу" }, { status: 400 });
  }
  if (!Number.isInteger(problemCount) || problemCount < 1 || problemCount > 30) {
    return NextResponse.json({ ok: false, error: "Бодлогын тоо 1–30 байна" }, { status: 400 });
  }
  if (!Number.isInteger(maxPerProblem) || maxPerProblem < 1 || maxPerProblem > 100) {
    return NextResponse.json({ ok: false, error: "Нэг бодлогын дээд оноо 1–100 байна" }, { status: 400 });
  }

  const olympiad = await createOlympiad({ programId, title, heldOn, problemCount, maxPerProblem });
  await logAdminAction(request, {
    actionType: "olympiad.create",
    targetId: olympiad.id,
    details: { programId, title, heldOn, problemCount, maxPerProblem },
  });
  return NextResponse.json({ ok: true, olympiad });
}
