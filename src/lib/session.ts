import { cookies, headers } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { createSession, deleteSession, findSessionUserId, findUserById, logLogin, type User } from "./db";
import { getClientIp } from "./rateLimit";

/**
 * Placeholder auth: a signed cookie stands in for a real session store
 * (NextAuth, Supabase Auth, etc). The signature stops a raw cookie value
 * from being forged/replayed, but there's still no server-side revocation
 * of password changes — replace with real auth before this needs to
 * withstand serious attack.
 *
 * The cookie holds a session id (see the `sessions` table), not the user id
 * directly. Logging in deletes any other session row for that user first,
 * so only the newest login's cookie still resolves to a user — an older
 * device's cookie starts reading as logged out the next time it's checked.
 * That's the whole "one active session per user" mechanism.
 *
 * If SESSION_SECRET isn't set, sessions fall back to unsigned (the old
 * behavior) rather than crashing every page load — a missing env var on a
 * fresh deploy shouldn't take the whole site down. Set SESSION_SECRET and
 * redeploy to turn on real signing; every existing session is logged out
 * the moment that happens (old raw-id cookies won't verify).
 */

const SESSION_COOKIE = "session_user_id";
const ADMIN_COOKIE = "admin_session";
const ADMIN_MARKER = "admin-ok";

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error(
      "[session] SESSION_SECRET is not set — sessions are UNSIGNED and forgeable. Set SESSION_SECRET and redeploy."
    );
    return null;
  }
  return secret;
}

function sign(value: string): string {
  const secret = getSessionSecret();
  if (!secret) return value;
  const mac = createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${mac}`;
}

function unsign(cookieValue: string): string | null {
  const secret = getSessionSecret();
  if (!secret) return cookieValue;

  const idx = cookieValue.lastIndexOf(".");
  if (idx === -1) return null;
  const value = cookieValue.slice(0, idx);
  const mac = cookieValue.slice(idx + 1);
  const expectedMac = createHmac("sha256", secret).update(value).digest("hex");

  const macBuffer = Buffer.from(mac, "hex");
  const expectedBuffer = Buffer.from(expectedMac, "hex");
  if (macBuffer.length !== expectedBuffer.length || !timingSafeEqual(macBuffer, expectedBuffer)) {
    return null;
  }
  return value;
}

export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const sessionId = unsign(raw);
  if (!sessionId) return null;
  const userId = await findSessionUserId(sessionId);
  if (!userId) return null;
  return (await findUserById(userId)) ?? null;
}

export async function setSessionUser(userId: string) {
  const sessionId = await createSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, sign(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  const hdrs = await headers();
  await logLogin(userId, { userAgent: hdrs.get("user-agent"), ip: getClientIp(hdrs) });
}

export async function clearSessionUser() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const sessionId = raw ? unsign(raw) : null;
  if (sessionId) await deleteSession(sessionId);
  store.delete(SESSION_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(ADMIN_COOKIE)?.value;
  if (!raw) return false;
  return unsign(raw) === ADMIN_MARKER;
}

export async function setAdminSession() {
  const store = await cookies();
  store.set(ADMIN_COOKIE, sign(ADMIN_MARKER), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export function checkAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("Missing ADMIN_PASSWORD environment variable.");
  }
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
