import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createSignedUrl, MINI_OLYMPIAD_BUCKET } from "@/lib/storage";
import { findResultWithOlympiad } from "@/lib/miniOlympiad/db";

/**
 * The family's own scan, through a one-minute signed link. Anything that is
 * not this child's published result is a 404 — not 403 — so nobody learns
 * which results exist.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ resultId: string; index: string }> }) {
  const user = await getSessionUser();
  const notFound = NextResponse.json({ ok: false, error: "Олдсонгүй" }, { status: 404 });
  if (!user) return notFound;
  const { resultId, index } = await params;
  const found = await findResultWithOlympiad(resultId);
  if (!found || found.result.userId !== user.id || !found.olympiad.publishedAt) return notFound;
  const file = found.result.files[Number(index)];
  const url = file ? await createSignedUrl(MINI_OLYMPIAD_BUCKET, file.path, 60) : null;
  return url ? NextResponse.redirect(url) : notFound;
}
