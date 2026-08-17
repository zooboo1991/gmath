/**
 * POST /api/account/reset-password — src/app/api/account/reset-password/route.ts
 *
 * This is the account-takeover route: whoever can drive it to completion owns
 * the account, and with it every registration, recording and certificate on
 * it. Phone + email alone used to be enough, which is why the OTP check
 * exists; these tests are mostly about that check not being skippable.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb, trackBy } from "../../support/db";
import {
  countSessionsFor,
  createTestUser,
  makePhone,
  readOtp,
  readUser,
  seedVerifiedOtp,
} from "../../support/factories";

const NEW_PASSWORD = "Brand9New";

afterAll(async () => {
  await cleanupTracked();
});

async function primeRateLimit(key: string, attempts: number): Promise<void> {
  const { error } = await testDb()
    .from("rate_limits")
    .upsert({ key, attempts, window_start: new Date().toISOString() });
  if (error) throw error;
  trackBy("rate_limits", "key", key);
}

describe("phone verification is enforced server-side", () => {
  it("refuses to change a password without a verified OTP", async () => {
    const user = await createTestUser();
    const before = await readUser(user.id);

    const res = await anonClient().post("/api/account/reset-password", {
      phone: user.phone,
      email: user.email,
      newPassword: NEW_PASSWORD,
    });

    expect(res.status).toBe(400);
    // The stored hash is untouched — the old password still works.
    expect((await readUser(user.id))?.password_hash).toBe(before?.password_hash);
    const stillWorks = await anonClient().post("/api/account/login", {
      phone: user.phone,
      password: user.password,
    });
    expect(stillWorks.status).toBe(200);
  });

  it("refuses an OTP verified for registration rather than reset", async () => {
    const user = await createTestUser();
    await seedVerifiedOtp(user.phone, "register");

    const res = await anonClient().post("/api/account/reset-password", {
      phone: user.phone,
      email: user.email,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);
  });

  it("refuses an OTP verified more than 15 minutes ago", async () => {
    const user = await createTestUser();
    await seedVerifiedOtp(user.phone, "reset", {
      verifiedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    });

    const res = await anonClient().post("/api/account/reset-password", {
      phone: user.phone,
      email: user.email,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);
  });

  it("changes the password with a verified OTP and spends it", async () => {
    const user = await createTestUser();
    const otp = await seedVerifiedOtp(user.phone, "reset");

    const client = anonClient();
    const res = await client.post("/api/account/reset-password", {
      phone: user.phone,
      email: user.email,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(client.getCookie("session_user_id")).toBeTruthy();

    expect((await readOtp(otp.id))?.consumed_at).toBeTruthy();

    const withNew = await anonClient().post("/api/account/login", {
      phone: user.phone,
      password: NEW_PASSWORD,
    });
    expect(withNew.status).toBe(200);

    const withOld = await anonClient().post("/api/account/login", {
      phone: user.phone,
      password: user.password,
    });
    expect(withOld.status).toBe(401);
  });

  it("cannot reuse one verified OTP for a second reset", async () => {
    const user = await createTestUser();
    await seedVerifiedOtp(user.phone, "reset");

    const first = await anonClient().post("/api/account/reset-password", {
      phone: user.phone,
      email: user.email,
      newPassword: NEW_PASSWORD,
    });
    expect(first.status).toBe(200);

    const second = await anonClient().post("/api/account/reset-password", {
      phone: user.phone,
      email: user.email,
      newPassword: "Another9Pass",
    });
    expect(second.status).toBe(400);

    // The second attempt changed nothing.
    const stillNew = await anonClient().post("/api/account/login", {
      phone: user.phone,
      password: NEW_PASSWORD,
    });
    expect(stillNew.status).toBe(200);
  });

  it("cannot reset someone else's account with an OTP verified for your own number", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();
    await seedVerifiedOtp(attacker.phone, "reset");

    const res = await anonClient().post("/api/account/reset-password", {
      phone: victim.phone,
      email: victim.email,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);

    const victimStillOk = await anonClient().post("/api/account/login", {
      phone: victim.phone,
      password: victim.password,
    });
    expect(victimStillOk.status).toBe(200);
  });
});

describe("identity checks", () => {
  it("answers an unknown phone exactly as it answers a wrong email", async () => {
    const user = await createTestUser();

    const wrongEmail = await anonClient().post<{ error: string }>("/api/account/reset-password", {
      phone: user.phone,
      email: "someone-else@example.test",
      newPassword: NEW_PASSWORD,
    });
    const unknownPhone = await anonClient().post<{ error: string }>("/api/account/reset-password", {
      phone: makePhone(),
      email: "someone-else@example.test",
      newPassword: NEW_PASSWORD,
    });

    expect(unknownPhone.status).toBe(wrongEmail.status);
    expect(unknownPhone.body.error).toBe(wrongEmail.body.error);
    expect(wrongEmail.status).toBe(404);
  });

  describe("malformed input", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["no phone", { email: "a@b.test", newPassword: NEW_PASSWORD }],
      ["bad phone", { phone: "12ab", email: "a@b.test", newPassword: NEW_PASSWORD }],
      ["no email", { phone: "99112233", newPassword: NEW_PASSWORD }],
      ["blank email", { phone: "99112233", email: "   ", newPassword: NEW_PASSWORD }],
      ["password with no digit", { phone: "99112233", email: "a@b.test", newPassword: "Password" }],
      ["password with no uppercase", { phone: "99112233", email: "a@b.test", newPassword: "passw0rd" }],
      ["password too short", { phone: "99112233", email: "a@b.test", newPassword: "Pa1" }],
      [
        "password over MAX_LEN.password",
        { phone: "99112233", email: "a@b.test", newPassword: `Aa1${"x".repeat(200)}` },
      ],
    ];

    for (const [name, body] of cases) {
      it(`answers 400 for ${name}`, async () => {
        const res = await anonClient().post("/api/account/reset-password", body);
        expect(res.status).toBe(400);
      });
    }
  });

  it("stops after five attempts on one phone number", async () => {
    const user = await createTestUser();
    await primeRateLimit(`reset-password:${user.phone}`, 5);

    const res = await anonClient().post("/api/account/reset-password", {
      phone: user.phone,
      email: user.email,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(429);
  });
});

describe("sessions after a password change", () => {
  /**
   * Resetting the password is what a parent does when they think someone else
   * is in the account, so it has to remove that someone else's session — see
   * BUGS.md #2, fixed in updateUserPassword.
   */
  it("signs other devices out when the password is changed", async () => {
    const user = await createTestUser();
    const otherDevice = await signedInClient(user.phone, user.password);
    expect(await countSessionsFor(user.id)).toBe(1);

    await seedVerifiedOtp(user.phone, "reset");
    const res = await anonClient().post("/api/account/reset-password", {
      phone: user.phone,
      email: user.email,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);

    const me = await otherDevice.get<{ user: { id: string } | null }>("/api/account/me");
    expect(me.body.user).toBeNull();
  });

  /**
   * The other half of the same guarantee: the reset must not sign out the
   * person doing it. A fix that simply deleted every session would pass the
   * test above and leave the parent staring at a login screen.
   */
  it("keeps the device that performed the reset signed in", async () => {
    const user = await createTestUser();
    await signedInClient(user.phone, user.password);

    await seedVerifiedOtp(user.phone, "reset");
    const resetter = anonClient();
    const res = await resetter.post("/api/account/reset-password", {
      phone: user.phone,
      email: user.email,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);

    const me = await resetter.get<{ user: { id: string } | null }>("/api/account/me");
    expect(me.body.user?.id).toBe(user.id);
    // Exactly one: the old device's row is gone, the new one took its place.
    expect(await countSessionsFor(user.id)).toBe(1);
  });
});
