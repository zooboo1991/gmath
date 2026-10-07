import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { deleteOlympiad, findOlympiad, listResults, removeOlympiadFiles, updateOlympiad } from "@/lib/miniOlympiad/db";
import { adminDetail } from "@/lib/miniOlympiad/view";
import { isOlympiadDate } from "@/lib/miniOlympiad/score";

const NOT_FOUND = { ok: false, error: "Олимпиад олдсонгүй" } as const;

/** The olympiad, its ranked results and the programme's children. Any admin may look. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json(REFUSED, { status: 401 });
  const olympiad = await findOlympiad((await params).id);
  if (!olympiad) return NextResponse.json(NOT_FOUND, { status: 404 });
  return NextResponse.json({ ok: true, ...(await adminDetail(olympiad)) });
}

/** Name, date and points per problem. The problem count is fixed once created. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const olympiad = await findOlympiad((await params).id);
  if (!olympiad) return NextResponse.json(NOT_FOUND, { status: 404 });
  const data = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: { title?: string; held_on?: string; max_per_problem?: number } = {};
  if (data.title !== undefined) {
    const title = typeof data.title === "string" ? data.title.trim() : "";
    if (!title || title.length > 120) {
      return NextResponse.json({ ok: false, error: "Нэрээ оруулна уу (120 тэмдэгтээс ихгүй)" }, { status: 400 });
    }
    patch.title = title;
  }
  if (data.heldOn !== undefined) {
    if (!isOlympiadDate(data.heldOn)) {
      return NextResponse.json({ ok: false, error: "Огноо буруу байна" }, { status: 400 });
    }
    patch.held_on = data.heldOn;
  }
  if (data.maxPerProblem !== undefined) {
    const max = Number(data.maxPerProblem);
    const highest = Math.max(0, ...(await listResults(olympiad)).flatMap((r) => r.scores.map((s) => s ?? 0)));
    if (!Number.isInteger(max) || max < 1 || max > 100 || max < highest) {
      return NextResponse.json(
        { ok: false, error: `Дээд оноо 1–100 бөгөөд одоо байгаа хамгийн их онооноос (${highest}) багагүй байна` },
        { status: 400 }
      );
    }
    patch.max_per_problem = max;
  }
  const updated = await updateOlympiad(olympiad.id, patch);
  await logAdminAction(request, { actionType: "olympiad.update", targetId: olympiad.id, details: patch });
  return NextResponse.json({ ok: true, olympiad: updated });
}

/** Removes the olympiad, every result and every stored scan. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const olympiad = await findOlympiad((await params).id);
  if (!olympiad) return NextResponse.json(NOT_FOUND, { status: 404 });
  const paths = (await listResults(olympiad)).flatMap((r) => r.files.map((f) => f.path));
  await deleteOlympiad(olympiad.id);
  await removeOlympiadFiles(paths);
  await logAdminAction(request, {
    actionType: "olympiad.delete",
    targetId: olympiad.id,
    details: { title: olympiad.title, programId: olympiad.programId, files: paths.length },
  });
  return NextResponse.json({ ok: true });
}
