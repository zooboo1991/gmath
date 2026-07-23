import { cookies } from "next/headers";
import { findUserById, type User } from "./db";

/**
 * Placeholder auth. The cookie just stores a user id in plain text — there
 * is no password, no signing, no expiry beyond maxAge. Good enough to demo
 * the "logged in?" branch from the registration flow; replace with real
 * auth (NextAuth, Supabase Auth, etc.) before this goes anywhere near
 * production.
 */

const SESSION_COOKIE = "session_user_id";
const ADMIN_COOKIE = "admin_session";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ganbat-admin-2026";

export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return (await findUserById(id)) ?? null;
}

export async function setSessionUser(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionUser() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === "1";
}

export async function setAdminSession() {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "1", {
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
  return password === ADMIN_PASSWORD;
}
