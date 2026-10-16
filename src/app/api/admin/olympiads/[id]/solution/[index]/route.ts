import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { REFUSED } from "@/lib/adminAccess";
import { createSignedUrl, MINI_OLYMPIAD_BUCKET } from "@/lib/storage";
import { findOlympiad } from "@/lib/miniOlympiad/db";

/** One of the olympiad's solution files for the admin, through a one-minute signed link. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  if (!(await isAdmin())) return NextResponse.json(REFUSED, { status: 401 });
  const { id, index } = await params;
  const olympiad = await findOlympiad(id);
  const file = olympiad?.solutionFiles[Number(index)];
  const url = file ? await createSignedUrl(MINI_OLYMPIAD_BUCKET, file.path, 60) : null;
  if (!url) return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 404 });
  return NextResponse.redirect(url);
}
