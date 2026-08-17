/**
 * SMS OTP — src/lib/otp.ts, /api/account/otp/send, /api/account/otp/verify.
 *
 * Two kinds of risk here. One is security: a code that can be guessed,
 * replayed or brute-forced defeats both the registration and the password
 * reset flow. The other is money — every send is an SMS off a prepaid
 * balance, so the endpoint must not text a number that isn't the account
 * holder's, and must not be usable as a way to run that balance down.
 *
 * Every send in this file goes to the mock (see tests/support/network-guard.mjs);
 * nothing reaches Skytel.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient } from "../../support/client";
import { cleanupTracked, testDb, trackBy } from "../../support/db";
import { createTestUser, makePhone, readOtp, seedOtp } from "../../support/factories";
import { mockCalls, resetMockCalls } from "../../support/mockControl";

afterAll(async () => {
  await cleanupTracked();
});

beforeEach(async () => {
  await resetMockCalls();
});

/** The SMS messages the gateway was asked to send, newest last. */
async function sentSms(): Promise<{ to: string; message: string }[]> {
  const calls = await mockCalls("skytel");
  return calls.map((c) => ({ to: c.query.sendto ?? "", message: c.query.message ?? "" }));
}

/**
 * Pre-loads a rate-limit counter so a cap can be tested without making the
 * calls that would fill it (the send cooldown is one per minute, which no
 * test can sit through).
 */
async function primeRateLimit(key: string, attempts: number): Promise<void> {
  const { error } = await testDb()
    .from("rate_limits")
    .upsert({ key, attempts, window_start: new Date().toISOString() });
  if (error) throw error;
  trackBy("rate_limits", "key", key);
}

describe("POST /api/account/otp/send", () => {
  it("sends a four digit code to the number that asked for it", async () => {
    const phone = makePhone();
    const res = await anonClient().post("/api/account/otp/send", { phone, purpose: "register" });
    expect(res.status).toBe(200);

    const messages = await sentSms();
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe(phone);
    expect(messages[0].message).toMatch(/\b\d{4}\b/);

    const { data } = await testDb().from("otp_codes").select("id").eq("phone", phone);
    for (const row of (data ?? []) as { id: string }[]) trackBy("otp_codes", "id", row.id);
  });

  it("refuses to register a phone that already has an account, and sends nothing", async () => {
    const user = await createTestUser();
    const res = await anonClient().post("/api/account/otp/send", {
      phone: user.phone,
      purpose: "register",
    });

    expect(res.status).toBe(409);
    expect(await sentSms()).toHaveLength(0);
  });

  it("answers a reset for an unknown number with a plain ok, and sends nothing", async () => {
    const res = await anonClient().post<{ ok: boolean }>("/api/account/otp/send", {
      phone: makePhone(),
      purpose: "reset",
      email: "someone@example.test",
    });

    // Deliberately indistinguishable from success: this endpoint must not
    // become a way to find out which numbers are registered.
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(await sentSms()).toHaveLength(0);
  });

  it("answers a reset with the wrong email the same way, and sends nothing", async () => {
    const user = await createTestUser();
    const res = await anonClient().post<{ ok: boolean }>("/api/account/otp/send", {
      phone: user.phone,
      purpose: "reset",
      email: "not-their-address@example.test",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // The important half: no SMS to a real user's phone at an attacker's request.
    expect(await sentSms()).toHaveLength(0);
  });

  it("sends a reset code when the phone and email match, ignoring case", async () => {
    const user = await createTestUser();
    const res = await anonClient().post("/api/account/otp/send", {
      phone: user.phone,
      purpose: "reset",
      email: user.email.toUpperCase(),
    });
    expect(res.status).toBe(200);

    const messages = await sentSms();
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe(user.phone);

    const { data } = await testDb().from("otp_codes").select("id").eq("phone", user.phone);
    for (const row of (data ?? []) as { id: string }[]) trackBy("otp_codes", "id", row.id);
  });

  it("refuses a second code within the cooldown", async () => {
    const phone = makePhone();
    const first = await anonClient().post("/api/account/otp/send", { phone, purpose: "register" });
    expect(first.status).toBe(200);

    const second = await anonClient().post("/api/account/otp/send", { phone, purpose: "register" });
    expect(second.status).toBe(429);
    expect(await sentSms()).toHaveLength(1);

    const { data } = await testDb().from("otp_codes").select("id").eq("phone", phone);
    for (const row of (data ?? []) as { id: string }[]) trackBy("otp_codes", "id", row.id);
  });

  it("refuses more than five codes an hour for one number", async () => {
    const phone = makePhone();
    await primeRateLimit(`otp-hourly:register:${phone}`, 5);

    const res = await anonClient().post<{ error: string }>("/api/account/otp/send", {
      phone,
      purpose: "register",
    });
    expect(res.status).toBe(429);
    expect(await sentSms()).toHaveLength(0);
  });

  describe("malformed input", () => {
    const cases: [string, unknown][] = [
      ["no phone", { purpose: "register" }],
      ["short phone", { phone: "9911", purpose: "register" }],
      ["phone with letters", { phone: "9911abcd", purpose: "register" }],
      ["no purpose", { phone: "99112233" }],
      ["unknown purpose", { phone: "99112233", purpose: "login" }],
    ];

    for (const [name, body] of cases) {
      it(`answers 400 for ${name} without sending`, async () => {
        const res = await anonClient().post("/api/account/otp/send", body);
        expect(res.status).toBe(400);
        expect(await sentSms()).toHaveLength(0);
      });
    }
  });
});

describe("POST /api/account/otp/verify", () => {
  it("accepts the code that was actually sent", async () => {
    const phone = makePhone();
    await anonClient().post("/api/account/otp/send", { phone, purpose: "register" });
    const [sms] = await sentSms();
    const code = sms.message.match(/(\d{4})\s*$/)?.[1];
    expect(code).toBeTruthy();

    const res = await anonClient().post("/api/account/otp/verify", {
      phone,
      purpose: "register",
      code,
    });
    expect(res.status).toBe(200);

    const { data } = await testDb().from("otp_codes").select("id, verified_at").eq("phone", phone);
    const rows = (data ?? []) as { id: string; verified_at: string | null }[];
    for (const row of rows) trackBy("otp_codes", "id", row.id);
    expect(rows.some((r) => r.verified_at !== null)).toBe(true);
  });

  it("rejects a wrong code and leaves the row unverified", async () => {
    const phone = makePhone();
    const otp = await seedOtp(phone, "register", { code: "1234" });

    const res = await anonClient().post("/api/account/otp/verify", {
      phone,
      purpose: "register",
      code: "9999",
    });
    expect(res.status).toBe(400);
    expect((await readOtp(otp.id))?.verified_at).toBeNull();
  });

  it("rejects an expired code even when the digits are right", async () => {
    const phone = makePhone();
    const otp = await seedOtp(phone, "register", {
      code: "1234",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await anonClient().post("/api/account/otp/verify", {
      phone,
      purpose: "register",
      code: "1234",
    });
    expect(res.status).toBe(400);
    expect((await readOtp(otp.id))?.verified_at).toBeNull();
  });

  it("rejects a code issued for a different phone number", async () => {
    const owner = makePhone();
    const attacker = makePhone();
    await seedOtp(owner, "register", { code: "1234" });

    const res = await anonClient().post("/api/account/otp/verify", {
      phone: attacker,
      purpose: "register",
      code: "1234",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a code issued for a different purpose", async () => {
    const phone = makePhone();
    await seedOtp(phone, "register", { code: "1234" });

    const res = await anonClient().post("/api/account/otp/verify", {
      phone,
      purpose: "reset",
      code: "1234",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a code that has already been verified once", async () => {
    const phone = makePhone();
    await seedOtp(phone, "register", { code: "1234" });

    const first = await anonClient().post("/api/account/otp/verify", {
      phone,
      purpose: "register",
      code: "1234",
    });
    expect(first.status).toBe(200);

    const second = await anonClient().post("/api/account/otp/verify", {
      phone,
      purpose: "register",
      code: "1234",
    });
    expect(second.status).toBe(400);
  });

  it("rejects a code that has already been consumed", async () => {
    const phone = makePhone();
    await seedOtp(phone, "register", {
      code: "1234",
      verifiedAt: new Date().toISOString(),
      consumedAt: new Date().toISOString(),
    });

    const res = await anonClient().post("/api/account/otp/verify", {
      phone,
      purpose: "register",
      code: "1234",
    });
    expect(res.status).toBe(400);
  });

  it("rejects when no code was ever requested for that number", async () => {
    const res = await anonClient().post("/api/account/otp/verify", {
      phone: makePhone(),
      purpose: "register",
      code: "1234",
    });
    expect(res.status).toBe(400);
  });

  describe("malformed input", () => {
    const cases: [string, unknown][] = [
      ["three digit code", { phone: "99112233", purpose: "register", code: "123" }],
      ["five digit code", { phone: "99112233", purpose: "register", code: "12345" }],
      ["letters for a code", { phone: "99112233", purpose: "register", code: "abcd" }],
      ["missing code", { phone: "99112233", purpose: "register" }],
      ["missing purpose", { phone: "99112233", code: "1234" }],
      ["bad phone", { phone: "99", purpose: "register", code: "1234" }],
    ];

    for (const [name, body] of cases) {
      it(`answers 400 for ${name}`, async () => {
        const res = await anonClient().post("/api/account/otp/verify", body);
        expect(res.status).toBe(400);
      });
    }
  });

  it("stops guessing after 8 wrong codes", async () => {
    const phone = makePhone();
    await seedOtp(phone, "register", { code: "1234" });
    const client = anonClient();

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const res = await client.post("/api/account/otp/verify", {
        phone,
        purpose: "register",
        code: "9999",
      });
      expect(res.status, `attempt ${attempt}`).toBe(400);
    }

    // A 4 digit code is 10,000 guesses; without this cap it falls in minutes.
    const blocked = await client.post("/api/account/otp/verify", {
      phone,
      purpose: "register",
      code: "9999",
    });
    expect(blocked.status).toBe(429);

    // The lockout also covers the correct code, so an attacker who reaches
    // the right digits on the last guess still gets nothing.
    const withRightCode = await anonClient().post("/api/account/otp/verify", {
      phone,
      purpose: "register",
      code: "1234",
    });
    expect(withRightCode.status).toBe(429);
  });
});
