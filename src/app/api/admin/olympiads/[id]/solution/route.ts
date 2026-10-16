import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { createOlympiadUploadUrl, isOlympiadFileExt, isOlympiadFilePath } from "@/lib/storage";
import { findOlympiad, listResults, removeOlympiadFiles, setSolutionFiles } from "@/lib/miniOlympiad/db";
import { adminDetail } from "@/lib/miniOlympiad/view";

/**
 * The olympiad's own worked solutions — the teacher's model answers — which
 * every child who took part sees beside their result once it is published.
 * Uploaded like a child's scan: the browser puts the file straight into
 * Storage, then the path is recorded here.
 */

type Ctx = { params: Promise<{ id: string }> };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 5;
const TOO_MANY = `Бодолтод ${MAX_FILES}-аас олон файл хавсаргахгүй`;
const NO_OLYMPIAD = { ok: false, error: "Олимпиад олдсонгүй" } as const;

/** A one-time upload URL for a solution file ({ext: pdf|jpg|png, size}). */
export async function POST(request: Request, { params }: Ctx) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const olympiad = await findOlympiad((await params).id);
  if (!olympiad) return NextResponse.json(NO_OLYMPIAD, { status: 404 });
  const data = (await request.json().catch(() => ({}))) as { ext?: unknown; size?: unknown };
  const size = Number(data.size);
  if (!isOlympiadFileExt(data.ext)) {
    return NextResponse.json({ ok: false, error: "Зөвхөн PDF, JPG, PNG файл" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "Файл 20MB-аас ихгүй байх ёстой" }, { status: 400 });
  }
  if (olympiad.solutionFiles.length >= MAX_FILES) return NextResponse.json({ ok: false, error: TOO_MANY }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await createOlympiadUploadUrl(olympiad.id, data.ext)) });
}

/** Records an uploaded solution file ({path, name, size}). */
export async function PUT(request: Request, { params }: Ctx) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const olympiad = await findOlympiad((await params).id);
  if (!olympiad) return NextResponse.json(NO_OLYMPIAD, { status: 404 });
  const data = (await request.json().catch(() => ({}))) as { path?: unknown; name?: unknown; size?: unknown };
  if (!isOlympiadFilePath(olympiad.id, data.path)) {
    return NextResponse.json({ ok: false, error: "Файлын зам буруу байна" }, { status: 400 });
  }
  const path = data.path;
  // A child's scan is that family's alone; it must never become everyone's solution.
  if ((await listResults(olympiad)).some((r) => r.files.some((f) => f.path === path))) {
    return NextResponse.json({ ok: false, error: "Энэ файл сурагчийн бодолтод хавсаргагдсан байна" }, { status: 400 });
  }
  if (olympiad.solutionFiles.some((f) => f.path === path)) return NextResponse.json({ ok: true, ...(await adminDetail(olympiad)) });
  if (olympiad.solutionFiles.length >= MAX_FILES) return NextResponse.json({ ok: false, error: TOO_MANY }, { status: 400 });
  const name = (typeof data.name === "string" ? data.name.trim() : "").slice(0, 120) || "бодолт";
  const size = Number.isFinite(Number(data.size)) ? Number(data.size) : 0;
  const updated = await setSolutionFiles(olympiad.id, [...olympiad.solutionFiles, { path, name, size }]);
  if (!updated) return NextResponse.json(NO_OLYMPIAD, { status: 404 });
  await logAdminAction(request, { actionType: "olympiad.solution", targetId: olympiad.id, details: { title: olympiad.title, fileAdded: name } });
  return NextResponse.json({ ok: true, ...(await adminDetail(updated)) });
}

/** Removes one solution file (?path=…) from the olympiad and from Storage. */
export async function DELETE(request: Request, { params }: Ctx) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const olympiad = await findOlympiad((await params).id);
  if (!olympiad) return NextResponse.json(NO_OLYMPIAD, { status: 404 });
  const path = new URL(request.url).searchParams.get("path");
  const file = olympiad.solutionFiles.find((f) => f.path === path);
  if (!file || !isOlympiadFilePath(olympiad.id, path)) return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 404 });
  const updated = await setSolutionFiles(olympiad.id, olympiad.solutionFiles.filter((f) => f.path !== path));
  if (!updated) return NextResponse.json(NO_OLYMPIAD, { status: 404 });
  await removeOlympiadFiles([path]);
  await logAdminAction(request, { actionType: "olympiad.solution", targetId: olympiad.id, details: { title: olympiad.title, fileRemoved: file.name } });
  return NextResponse.json({ ok: true, ...(await adminDetail(updated)) });
}
