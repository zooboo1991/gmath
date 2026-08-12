import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findArticleById, recordArticleShare } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const VISITOR_COOKIE = "vid";
const CHANNELS = new Set(["facebook", "copy"]);

/**
 * Records a click on an article's share button.
 *
 * This counts *our button being used*, which is not the same as the number of
 * shares Facebook ended up with — someone can close the sharer dialog, and a
 * link pasted by hand never reaches here. The admin column is labelled
 * accordingly.
 *
 * Doesn't mint a visitor cookie of its own: it reads the one the pageview
 * tracker already set, and a missing value simply means an anonymous row.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { allowed } = await checkRateLimit(`share:${getClientIp(request.headers)}`, 60, 60);
  if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const { id } = await params;
  const data = await request.json().catch(() => null);
  const channel = typeof data?.channel === "string" && CHANNELS.has(data.channel) ? data.channel : "facebook";

  // Guards against rows piling up for ids that don't exist (or aren't public
  // yet), which would make the admin counts meaningless.
  const article = await findArticleById(id);
  if (!article) return NextResponse.json({ ok: false }, { status: 404 });

  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value;

  try {
    await recordArticleShare({ articleId: id, channel, visitorId });
  } catch (err) {
    // Best-effort, exactly like the pageview tracker: a bookkeeping failure
    // must not break sharing for the visitor.
    console.error("[share] failed to record:", err);
  }
  return NextResponse.json({ ok: true });
}
