import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/adminLog";
import { getMessengerProfile, setMessengerProfile } from "@/lib/messenger/profile";
import { isFullAdmin } from "@/lib/session";

/** What the Page currently shows — greeting + persistent menu. */
export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const result = await getMessengerProfile();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

/**
 * Pushes the greeting + persistent menu defined in lib/messenger/profile.ts to
 * the Facebook Page. Idempotent: Meta replaces both fields wholesale, so
 * pressing the button twice is harmless.
 */
export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const result = await setMessengerProfile();
  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }

  // Worth an audit entry: it changes what every visitor to the Page sees.
  await logAdminAction(request, { actionType: "messenger.profile_update" });
  return NextResponse.json({ ok: true });
}
