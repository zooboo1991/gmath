/**
 * Session cookies — src/lib/session.ts, plus /api/account/me and /logout.
 *
 * The cookie holds a session id signed with HMAC-SHA256. Two things have to
 * hold, and neither is visible from the outside without testing it:
 *
 *   - a cookie that wasn't signed by this server does not authenticate,
 *     however plausible its contents (including a genuine session id)
 *   - an account holds MAX_SESSIONS_PER_USER session, and the login
 *     that goes over the limit really does invalidate the oldest one
 */

import { afterAll, describe, expect, it } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { anonClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb } from "../../support/db";
import { countSessionsFor, createTestUser } from "../../support/factories";

const COOKIE = "session_user_id";

afterAll(async () => {
  await cleanupTracked();
});

async function currentUserId(client: TestClient): Promise<string | null> {
  const res = await client.get<{ user: { id: string } | null }>("/api/account/me");
  expect(res.status).toBe(200);
  return res.body.user?.id ?? null;
}

async function sessionIdsFor(userId: string): Promise<string[]> {
  const { data, error } = await testDb()
    .from("sessions")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as { id: string }[]).map((r) => r.id);
}

describe("cookie signature", () => {
  it("does not accept a genuine session id that has not been signed", async () => {
    const user = await createTestUser();
    await signedInClient(user.phone, user.password);
    const [sessionId] = await sessionIdsFor(user.id);
    expect(sessionId).toBeTruthy();

    // The id is real and live in the sessions table — only the signature is
    // missing. If this authenticated, the signing would be decorative.
    const forger = anonClient();
    forger.setCookie(COOKIE, sessionId);
    expect(await currentUserId(forger)).toBeNull();
  });

  it("does not accept a made-up session id", async () => {
    const forger = anonClient();
    forger.setCookie(COOKIE, randomUUID());
    expect(await currentUserId(forger)).toBeNull();
  });

  it("does not accept a cookie whose signature has been altered", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    const real = client.getCookie(COOKIE)!;
    expect(real).toContain(".");

    const dot = real.lastIndexOf(".");
    const value = real.slice(0, dot);
    const mac = real.slice(dot + 1);
    // Flip one hex character of the MAC.
    const tamperedMac = (mac[0] === "a" ? "b" : "a") + mac.slice(1);

    const forger = anonClient();
    forger.setCookie(COOKIE, `${value}.${tamperedMac}`);
    expect(await currentUserId(forger)).toBeNull();
  });

  it("does not accept another session's id carried on a valid signature", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();

    await signedInClient(victim.phone, victim.password);
    const [victimSession] = await sessionIdsFor(victim.id);

    const attackerClient = await signedInClient(attacker.phone, attacker.password);
    const attackerCookie = attackerClient.getCookie(COOKIE)!;
    const attackerMac = attackerCookie.slice(attackerCookie.lastIndexOf(".") + 1);

    // Swap in the victim's session id but keep the attacker's signature —
    // the MAC covers the value, so it must not verify.
    const forger = anonClient();
    forger.setCookie(COOKIE, `${victimSession}.${attackerMac}`);
    expect(await currentUserId(forger)).toBeNull();
  });

  it("does not accept a signature made with the wrong secret", async () => {
    const user = await createTestUser();
    await signedInClient(user.phone, user.password);
    const [sessionId] = await sessionIdsFor(user.id);

    const mac = createHmac("sha256", "not-the-session-secret").update(sessionId).digest("hex");
    const forger = anonClient();
    forger.setCookie(COOKIE, `${sessionId}.${mac}`);
    expect(await currentUserId(forger)).toBeNull();
  });

  it("does not treat a truncated or empty cookie as signed in", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    const real = client.getCookie(COOKIE)!;

    for (const value of ["", ".", real.split(".")[0] + ".", "." + real.split(".")[1]]) {
      const forger = anonClient();
      forger.setCookie(COOKIE, value);
      expect(await currentUserId(forger), `cookie=${JSON.stringify(value)}`).toBeNull();
    }
  });
});

describe("device limit (MAX_SESSIONS_PER_USER = 1)", () => {
  it("signs the previous device out as soon as the next one signs in", async () => {
    const user = await createTestUser();

    const phone = await signedInClient(user.phone, user.password);
    expect(await currentUserId(phone)).toBe(user.id);

    const laptop = await signedInClient(user.phone, user.password);

    // One row, and it belongs to the device that signed in last.
    expect(await countSessionsFor(user.id)).toBe(1);
    expect(await currentUserId(phone)).toBeNull();
    expect(await currentUserId(laptop)).toBe(user.id);
  });

  it("still holds the line at one after many logins", async () => {
    const user = await createTestUser();
    const clients: TestClient[] = [];
    for (let i = 0; i < 5; i += 1) {
      clients.push(await signedInClient(user.phone, user.password));
    }

    expect(await countSessionsFor(user.id)).toBe(1);
    const stillIn = await Promise.all(clients.map((c) => currentUserId(c)));
    expect(stillIn).toEqual([null, null, null, null, user.id]);
  });

  it("counts each account's devices separately", async () => {
    const one = await createTestUser();
    const two = await createTestUser();

    await signedInClient(one.phone, one.password);
    await signedInClient(one.phone, one.password);
    const twoClient = await signedInClient(two.phone, two.password);

    expect(await countSessionsFor(one.id)).toBe(1);
    expect(await countSessionsFor(two.id)).toBe(1);
    // One account's logins never touch another's session.
    expect(await currentUserId(twoClient)).toBe(two.id);
  });
});

describe("logout", () => {
  it("deletes the session row so the cookie cannot be replayed", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    const cookie = client.getCookie(COOKIE)!;

    const res = await client.post("/api/account/logout");
    expect(res.status).toBe(200);
    expect(await countSessionsFor(user.id)).toBe(0);

    // Someone who copied the cookie before logout gets nothing with it.
    const replay = anonClient();
    replay.setCookie(COOKIE, cookie);
    expect(await currentUserId(replay)).toBeNull();
  });

  it("leaves the account's other device signed in", async () => {
    const user = await createTestUser();
    const first = await signedInClient(user.phone, user.password);
    const second = await signedInClient(user.phone, user.password);

    await first.post("/api/account/logout");

    expect(await currentUserId(first)).toBeNull();
    expect(await currentUserId(second)).toBe(user.id);
    expect(await countSessionsFor(user.id)).toBe(1);
  });

  it("does not fail when nobody is signed in", async () => {
    const res = await anonClient().post("/api/account/logout");
    expect(res.status).toBe(200);
  });

  it("does not fail on a forged cookie", async () => {
    const client = anonClient();
    client.setCookie(COOKIE, `${randomUUID()}.deadbeef`);
    const res = await client.post("/api/account/logout");
    expect(res.status).toBe(200);
  });
});
