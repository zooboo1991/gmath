import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import {
  deleteResult,
  findOlympiad,
  findResult,
  listOlympiadRoster,
  notifyIfPublished,
  removeOlympiadFiles,
  upsertResult,
  UUID_RE,
} from "@/lib/miniOlympiad/db";
import { normalizeScores, normalizeTexts } from "@/lib/miniOlympiad/score";
import { adminDetail } from "@/lib/miniOlympiad/view";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** One child's scores, comments and notes — added, or replaced. */
export async function PUT(request: Request, { params }: Ctx) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const { id, userId } = await params;
  const olympiad = await findOlympiad(id);
  if (!olympiad) return NextResponse.json({ ok: false, error: "Олимпиад олдсонгүй" }, { status: 404 });
  if (!UUID_RE.test(userId)) return NextResponse.json({ ok: false, error: "Сурагч олдсонгүй" }, { status: 404 });

  // A child already in the olympiad stays editable even after leaving the programme.
  const existing = await findResult(olympiad, userId);
  if (!existing && !(await listOlympiadRoster(olympiad.programId)).some((r) => r.userId === userId)) {
    return NextResponse.json({ ok: false, error: "Энэ хөтөлбөрт бүртгэлгүй сурагч" }, { status: 400 });
  }

  const data = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const scores = normalizeScores(data.scores, olympiad.problemCount, olympiad.maxPerProblem);
  // Texts left out of the request stay as they are.
  const comments = data.comments === undefined && existing ? existing.comments : normalizeTexts(data.comments, olympiad.problemCount);
  const notes = data.notes === undefined && existing ? existing.notes : normalizeTexts(data.notes, olympiad.problemCount);
  if (!scores || !comments || !notes) {
    return NextResponse.json(
      { ok: false, error: `Оноо 0–${olympiad.maxPerProblem} хооронд, ${olympiad.problemCount} бодлого бүрт байх ёстой` },
      { status: 400 }
    );
  }
  // The editor sends what it opened ("opened": the scores/comments/notes, or null for a child it is
  // adding). If the row has changed since — an import, another admin — saving would revert that.
  // Scans are not compared: adding one while the editor is open is no conflict.
  if ("opened" in data) {
    const o = data.opened as { scores?: unknown; comments?: unknown; notes?: unknown } | null;
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const unchanged =
      o === null
        ? !existing
        : Boolean(existing && same(existing.scores, o.scores) && same(existing.comments, o.comments) && same(existing.notes, o.notes));
    if (!unchanged) {
      return NextResponse.json(
        {
          ok: false,
          error: existing
            ? "Энэ сурагчийн дүнг өөр хүн (эсвэл Excel оруулалт) өөрчилсөн байна — хаагаад дахин нээнэ үү."
            : "Энэ сурагчийн дүн аль хэдийн орсон байна — жагсаалтаас нь нээнэ үү.",
        },
        { status: 409 }
      );
    }
  }
  await upsertResult(olympiad, userId, { scores, comments, notes });
  // A child added after publishing sees the result at once, so the family is told now.
  const told = await notifyIfPublished(olympiad);
  await logAdminAction(request, {
    actionType: "olympiad.result",
    targetId: olympiad.id,
    details: { userId, scores, created: !existing, ...told },
  });
  return NextResponse.json({ ok: true, ...told, ...(await adminDetail(olympiad)) });
}

/** Takes a child out of the olympiad, with their stored scans. */
export async function DELETE(request: Request, { params }: Ctx) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const { id, userId } = await params;
  const olympiad = await findOlympiad(id);
  if (!olympiad) return NextResponse.json({ ok: false, error: "Олимпиад олдсонгүй" }, { status: 404 });
  const removed = UUID_RE.test(userId) ? await deleteResult(olympiad, userId) : undefined;
  if (!removed) return NextResponse.json({ ok: false, error: "Дүн олдсонгүй" }, { status: 404 });
  await removeOlympiadFiles(removed.files.map((f) => f.path));
  await logAdminAction(request, { actionType: "olympiad.result_delete", targetId: olympiad.id, details: { userId } });
  return NextResponse.json({ ok: true, ...(await adminDetail(olympiad)) });
}
