import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { logPageView } from "@/lib/db";
import { isTooLong, MAX_LEN } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const VISITOR_COOKIE = "vid";

export async function POST(request: Request) {
  const { allowed } = await checkRateLimit(`track:${getClientIp(request.headers)}`, 120, 60);
  if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const data = await request.json().catch(() => null);
  if (!data || typeof data.path !== "string" || !data.path.trim()) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (isTooLong(data.path, MAX_LEN.analyticsPath) || isTooLong(data.referrer, MAX_LEN.analyticsReferrer)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const store = await cookies();
  let visitorId = store.get(VISITOR_COOKIE)?.value;
  if (!visitorId) {
    visitorId = randomUUID();
    store.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // Best-effort: a broken pageview write (e.g. the migration hasn't run yet)
  // must never surface as an error to a visitor just browsing the site.
  try {
    await logPageView({
      path: data.path.trim(),
      referrer: typeof data.referrer === "string" && data.referrer.trim() ? data.referrer.trim() : null,
      visitorId,
    });
  } catch (err) {
    console.error("[track] failed to log pageview:", err);
  }

  return NextResponse.json({ ok: true });
}
