import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createSignedUrl, MINI_OLYMPIAD_BUCKET } from "@/lib/storage";
import { findResultWithOlympiad } from "@/lib/miniOlympiad/db";

/**
 * The olympiad's own solution, through a one-minute signed link — for a child
 * who took part, once the results are published. Reached through the family's
 * own result, so taking part is the check; anything else is a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ resultId: string; index: string }> }) {
  const user = await getSessionUser();
  const notFound = NextResponse.json({ ok: false, error: "Олдсонгүй" }, { status: 404 });
  if (!user) return notFound;
  const { resultId, index } = await params;
  const found = await findResultWithOlympiad(resultId);
  if (!found || found.result.userId !== user.id || !found.olympiad.publishedAt) return notFound;
  const file = found.olympiad.solutionFiles[Number(index)];
  const url = file ? await createSignedUrl(MINI_OLYMPIAD_BUCKET, file.path, 60) : null;
  return url ? NextResponse.redirect(url) : notFound;
}
