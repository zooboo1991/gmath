import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { createOlympiadUploadUrl, isOlympiadFileExt, isOlympiadFilePath } from "@/lib/storage";
import { changeResultFiles, findOlympiad, findResult, listResults, removeOlympiadFiles } from "@/lib/miniOlympiad/db";
import { adminDetail } from "@/lib/miniOlympiad/view";

type Ctx = { params: Promise<{ id: string; userId: string }> };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 10;
const TOO_MANY = `Нэг сурагчид ${MAX_FILES}-аас олон файл хавсаргахгүй`;
const NO_OLYMPIAD = { ok: false, error: "Олимпиад олдсонгүй" } as const;

/** A one-time upload URL for a scan of this child's work ({ext: pdf|jpg|png, size}). */
export async function POST(request: Request, { params }: Ctx) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const { id, userId } = await params;
  const olympiad = await findOlympiad(id);
  if (!olympiad) return NextResponse.json(NO_OLYMPIAD, { status: 404 });
  const result = await findResult(olympiad, userId);
  if (!result) return NextResponse.json({ ok: false, error: "Эхлээд сурагчийн дүнг оруулна уу" }, { status: 404 });
  const data = (await request.json().catch(() => ({}))) as { ext?: unknown; size?: unknown };
  const size = Number(data.size);
  if (!isOlympiadFileExt(data.ext)) {
    return NextResponse.json({ ok: false, error: "Зөвхөн PDF, JPG, PNG файл" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "Файл 20MB-аас ихгүй байх ёстой" }, { status: 400 });
  }
  if (result.files.length >= MAX_FILES) return NextResponse.json({ ok: false, error: TOO_MANY }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await createOlympiadUploadUrl(olympiad.id, data.ext)) });
}

/** Records an uploaded scan ({path, name, size}) on the child's result. */
export async function PUT(request: Request, { params }: Ctx) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const { id, userId } = await params;
  const olympiad = await findOlympiad(id);
  if (!olympiad) return NextResponse.json(NO_OLYMPIAD, { status: 404 });
  const data = (await request.json().catch(() => ({}))) as { path?: unknown; name?: unknown; size?: unknown };
  if (!isOlympiadFilePath(olympiad.id, data.path)) {
    return NextResponse.json({ ok: false, error: "Файлын зам буруу байна" }, { status: 400 });
  }
  const path = data.path;
  // One scan, one child: a path already on another child's result would show it to that family too.
  if ((await listResults(olympiad)).some((r) => r.userId !== userId && r.files.some((f) => f.path === path))) {
    return NextResponse.json({ ok: false, error: "Энэ файл өөр сурагчид хавсаргагдсан байна" }, { status: 400 });
  }
  const name = (typeof data.name === "string" ? data.name.trim() : "").slice(0, 120) || "бодолт";
  const size = Number.isFinite(Number(data.size)) ? Number(data.size) : 0;
  const done = await changeResultFiles(olympiad, userId, (files) => {
    if (files.some((f) => f.path === path)) return files;
    return files.length >= MAX_FILES ? { refuse: TOO_MANY } : [...files, { path, name, size }];
  });
  if ("refuse" in done) return NextResponse.json({ ok: false, error: done.refuse }, { status: done.status });
  await logAdminAction(request, {
    actionType: "olympiad.result",
    targetId: olympiad.id,
    details: { userId, fileAdded: name },
  });
  return NextResponse.json({ ok: true, ...(await adminDetail(olympiad)) });
}

/**
 * Removes one scan (?path=…) from the result and from Storage. Addressed by
 * path, not position: a stale screen in another tab can only miss, never
 * delete the wrong child's file.
 */
export async function DELETE(request: Request, { params }: Ctx) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const { id, userId } = await params;
  const olympiad = await findOlympiad(id);
  if (!olympiad) return NextResponse.json(NO_OLYMPIAD, { status: 404 });
  const path = new URL(request.url).searchParams.get("path");
  if (!isOlympiadFilePath(olympiad.id, path)) return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 404 });
  const done = await changeResultFiles(olympiad, userId, (files) =>
    files.some((f) => f.path === path) ? files.filter((f) => f.path !== path) : { refuse: "Файл олдсонгүй", status: 404 }
  );
  if ("refuse" in done) return NextResponse.json({ ok: false, error: done.refuse }, { status: done.status });
  await removeOlympiadFiles([path]);
  await logAdminAction(request, {
    actionType: "olympiad.result",
    targetId: olympiad.id,
    details: { userId, fileRemoved: done.before.files.find((f) => f.path === path)?.name },
  });
  return NextResponse.json({ ok: true, ...(await adminDetail(olympiad)) });
}
