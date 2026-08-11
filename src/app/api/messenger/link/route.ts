import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createLinkToken, listPsidsForUser, unlinkAllForUser } from "@/lib/messenger/db";

/**
 * The website half of account linking. The student is already signed in here,
 * which is exactly what makes this stronger than asking for a phone number in
 * Messenger: it proves they control the account that holds the registrations,
 * not just a number that once received an SMS.
 *
 * GET  — is this account linked yet? (for the profile card's state)
 * POST — mint a one-time token and hand back the m.me URL to open.
 */

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Нэвтрээгүй байна" }, { status: 401 });

  const psids = await listPsidsForUser(user.id);
  return NextResponse.json({
    ok: true,
    linked: psids.length > 0,
    count: psids.length,
    configured: Boolean(process.env.MESSENGER_PAGE_USERNAME),
  });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Нэвтрээгүй байна" }, { status: 401 });

  const pageUsername = process.env.MESSENGER_PAGE_USERNAME;
  if (!pageUsername) {
    return NextResponse.json(
      { ok: false, error: "Messenger холболт одоогоор тохируулагдаагүй байна." },
      { status: 503 }
    );
  }

  const code = await createLinkToken(user.id);
  // Two ways in, because the ref alone isn't dependable: Facebook passes `ref`
  // through to the webhook when the link is opened inside the mobile Messenger
  // app, but on desktop m.me redirects via messenger.com and the ref is
  // dropped. Sending the code as a message works everywhere, so the UI leads
  // with that and treats the ref as a shortcut when it happens to survive.
  return NextResponse.json({
    ok: true,
    code,
    url: `https://m.me/${encodeURIComponent(pageUsername)}?ref=${encodeURIComponent(code)}`,
  });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Нэвтрээгүй байна" }, { status: 401 });

  const removed = await unlinkAllForUser(user.id);
  return NextResponse.json({ ok: true, removed });
}
