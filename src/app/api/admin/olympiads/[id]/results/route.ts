import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { findOlympiad, listOlympiadRoster, listResults, notifyIfPublished, upsertResult, UUID_RE } from "@/lib/miniOlympiad/db";
import { normalizeScores, normalizeTexts } from "@/lib/miniOlympiad/score";
import { adminDetail } from "@/lib/miniOlympiad/view";

const MAX_ROWS = 300;

/**
 * Saves many children's results at once (the checked import). Every row must
 * name a child registered on the programme (or already in the olympiad). A
 * child already in the olympiad gets the new scores; comments and notes are
 * replaced by the workbook's when it has that sheet, and kept when it has
 * not (the row is sent without them). Scans are kept.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const olympiad = await findOlympiad((await params).id);
  if (!olympiad) return NextResponse.json({ ok: false, error: "Олимпиад олдсонгүй" }, { status: 404 });
  const data = (await request.json().catch(() => ({}))) as { rows?: unknown };
  if (!Array.isArray(data.rows) || data.rows.length === 0 || data.rows.length > MAX_ROWS) {
    return NextResponse.json({ ok: false, error: "Хадгалах дүн алга" }, { status: 400 });
  }

  const roster = new Set((await listOlympiadRoster(olympiad.programId)).map((r) => r.userId));
  const stored = new Map((await listResults(olympiad)).map((r) => [r.userId, r]));
  const count = olympiad.problemCount;
  const blank = Array.from({ length: count }, () => "");
  const clean: { userId: string; scores: (number | null)[]; comments: string[]; notes: string[] }[] = [];
  const seen = new Set<string>();
  for (const raw of data.rows as Record<string, unknown>[]) {
    const userId = typeof raw.userId === "string" ? raw.userId : "";
    if (!UUID_RE.test(userId) || !(roster.has(userId) || stored.has(userId))) {
      return NextResponse.json({ ok: false, error: "Хөтөлбөрт бүртгэлгүй сурагч байна — сурагчаа сонгоно уу" }, { status: 400 });
    }
    if (seen.has(userId)) {
      return NextResponse.json({ ok: false, error: "Нэг сурагч хоёр удаа сонгогдсон байна" }, { status: 400 });
    }
    seen.add(userId);
    const scores = normalizeScores(raw.scores, count, olympiad.maxPerProblem);
    const comments = raw.comments === undefined ? undefined : normalizeTexts(raw.comments, count);
    const notes = raw.notes === undefined ? undefined : normalizeTexts(raw.notes, count);
    if (!scores || comments === null || notes === null) {
      return NextResponse.json(
        { ok: false, error: `Оноо 0–${olympiad.maxPerProblem} хооронд, ${count} бодлого бүрт байх ёстой` },
        { status: 400 }
      );
    }
    // A whole sheet replaces, so a row first saved on the wrong child keeps none of that child's texts.
    const before = stored.get(userId);
    clean.push({ userId, scores, comments: comments ?? before?.comments ?? blank, notes: notes ?? before?.notes ?? blank });
  }

  for (const row of clean) await upsertResult(olympiad, row.userId, row);
  const told = await notifyIfPublished(olympiad);
  await logAdminAction(request, {
    actionType: "olympiad.import",
    targetId: olympiad.id,
    details: { title: olympiad.title, rows: clean.length, updated: clean.filter((r) => stored.has(r.userId)).length, ...told },
  });
  return NextResponse.json({ ok: true, ...told, ...(await adminDetail(olympiad)) });
}
