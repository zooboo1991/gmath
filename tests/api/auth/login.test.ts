/**
 * POST /api/account/login — src/app/api/account/login/route.ts
 *
 * Mostly about what login must refuse: a wrong password, a phone number that
 * has no account, malformed input, and an unlimited number of guesses. The
 * one happy-path case is here to prove the failures aren't failing for some
 * unrelated reason.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient } from "../../support/client";
import { cleanupTracked } from "../../support/db";
import { createTestUser, DEFAULT_PASSWORD, makePhone } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

describe("POST /api/account/login", () => {
  it("signs in with the right password and never returns the password hash", async () => {
    const user = await createTestUser();
    const res = await anonClient().post<{ ok: boolean; user: Record<string, unknown> }>(
      "/api/account/login",
      { phone: user.phone, password: user.password }
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.id).toBe(user.id);
    // toPublicUser() strips these; a leak here would put every account's
    // scrypt hash in front of anyone who can log in as themselves.
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body.user).not.toHaveProperty("passwordSalt");
    expect(res.text).not.toContain("passwordHash");
  });

  it("rejects a wrong password with 401 and sets no session cookie", async () => {
    const user = await createTestUser();
    const client = anonClient();
    const res = await client.post<{ ok: boolean; error: string }>("/api/account/login", {
      phone: user.phone,
      password: "WrongPass9",
    });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(client.getCookie("session_user_id")).toBeUndefined();
  });

  it("answers an unknown phone number exactly as it answers a wrong password", async () => {
    const user = await createTestUser();

    const wrongPassword = await anonClient().post<{ error: string }>("/api/account/login", {
      phone: user.phone,
      password: "WrongPass9",
    });
    const noSuchUser = await anonClient().post<{ error: string }>("/api/account/login", {
      phone: makePhone(),
      password: DEFAULT_PASSWORD,
    });

    // Any difference here — status or wording — turns login into a way to
    // find out which phone numbers have accounts.
    expect(noSuchUser.status).toBe(wrongPassword.status);
    expect(noSuchUser.body.error).toBe(wrongPassword.body.error);
  });

  it("rejects a password that is right for a different account", async () => {
    const alice = await createTestUser({ password: "Alice123" });
    await createTestUser({ password: "Bobby123" });

    const res = await anonClient().post("/api/account/login", {
      phone: alice.phone,
      password: "Bobby123",
    });
    expect(res.status).toBe(401);
  });

  describe("malformed input", () => {
    const cases: [string, unknown][] = [
      ["missing phone", { password: DEFAULT_PASSWORD }],
      ["empty phone", { phone: "", password: DEFAULT_PASSWORD }],
      ["phone with letters", { phone: "9911abcd", password: DEFAULT_PASSWORD }],
      ["phone too short", { phone: "9911", password: DEFAULT_PASSWORD }],
      ["phone too long", { phone: "991122334", password: DEFAULT_PASSWORD }],
      ["missing password", { phone: "99112233" }],
      ["empty password", { phone: "99112233", password: "" }],
      ["null password", { phone: "99112233", password: null }],
    ];

    for (const [name, body] of cases) {
      it(`answers 400 for ${name}`, async () => {
        const res = await anonClient().post("/api/account/login", body);
        expect(res.status).toBe(400);
      });
    }

    /**
     * A malformed body is bad input, and bad input is answered with a 400
     * here like everywhere else — see BUGS.md #3, fixed by treating an
     * unparseable body as an empty one and letting validation speak.
     */
    it("answers 400 rather than 500 for a body that is not JSON", async () => {
      const res = await anonClient().request("POST", "/api/account/login", {
        body: undefined,
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("brute force", () => {
    it("locks a phone number out after 8 wrong passwords", async () => {
      const user = await createTestUser();
      const client = anonClient();

      // checkRateLimit("login:<phone>", 8, 5min): eight attempts are let
      // through, the ninth is refused.
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        const res = await client.post(`/api/account/login`, {
          phone: user.phone,
          password: "WrongPass9",
        });
        expect(res.status, `attempt ${attempt}`).toBe(401);
      }

      const blocked = await client.post<{ error: string }>("/api/account/login", {
        phone: user.phone,
        password: "WrongPass9",
      });
      expect(blocked.status).toBe(429);

      // And the lockout is not bypassable by suddenly knowing the password.
      const withRightPassword = await anonClient().post("/api/account/login", {
        phone: user.phone,
        password: user.password,
      });
      expect(withRightPassword.status).toBe(429);
    });

    it("keeps the lockout to the phone number under attack", async () => {
      const target = await createTestUser();
      const bystander = await createTestUser();

      for (let attempt = 1; attempt <= 9; attempt += 1) {
        await anonClient().post("/api/account/login", {
          phone: target.phone,
          password: "WrongPass9",
        });
      }

      const res = await anonClient().post("/api/account/login", {
        phone: bystander.phone,
        password: bystander.password,
      });
      expect(res.status).toBe(200);
    });

    /**
     * The budget belongs to attackers, not to a family sharing one account —
     * see BUGS.md #1, fixed by counting failures rather than calls.
     */
    it("does not lock out a user whose password is correct every time", async () => {
      const user = await createTestUser();

      for (let attempt = 1; attempt <= 8; attempt += 1) {
        const res = await anonClient().post("/api/account/login", {
          phone: user.phone,
          password: user.password,
        });
        expect(res.status, `login ${attempt}`).toBe(200);
      }

      const ninth = await anonClient().post("/api/account/login", {
        phone: user.phone,
        password: user.password,
      });
      expect(ninth.status).toBe(200);
    });

    /**
     * Not counting successes is only half of it. Without clearing the counter
     * on a successful sign-in, a parent who mistyped seven times would stay
     * one miss away from a lockout for the rest of the window — a state they
     * cannot see or clear.
     */
    it("forgets earlier misses once the right password is used", async () => {
      const user = await createTestUser();

      for (let attempt = 1; attempt <= 7; attempt += 1) {
        const miss = await anonClient().post("/api/account/login", {
          phone: user.phone,
          password: "WrongPass1",
        });
        expect(miss.status, `miss ${attempt}`).toBe(401);
      }

      const good = await anonClient().post("/api/account/login", {
        phone: user.phone,
        password: user.password,
      });
      expect(good.status).toBe(200);

      // With the counter cleared this is miss #1 of a fresh window, so it is
      // refused for the password, not for the rate limit.
      const afterReset = await anonClient().post("/api/account/login", {
        phone: user.phone,
        password: "WrongPass1",
      });
      expect(afterReset.status).toBe(401);
    });
  });
});
