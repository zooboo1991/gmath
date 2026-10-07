import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { REFUSED } from "@/lib/adminAccess";
import { createSignedUrl, MINI_OLYMPIAD_BUCKET } from "@/lib/storage";
import { findOlympiad, findResult } from "@/lib/miniOlympiad/db";

/** A child's scan for the admin, through a one-minute signed link. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string; index: string }> }
) {
  if (!(await isAdmin())) return NextResponse.json(REFUSED, { status: 401 });
  const { id, userId, index } = await params;
  const olympiad = await findOlympiad(id);
  const result = olympiad ? await findResult(olympiad, userId) : undefined;
  const file = result?.files[Number(index)];
  const url = file ? await createSignedUrl(MINI_OLYMPIAD_BUCKET, file.path, 60) : null;
  if (!url) return NextResponse.json({ ok: false, error: "Файл олдсонгүй" }, { status: 404 });
  return NextResponse.redirect(url);
}
