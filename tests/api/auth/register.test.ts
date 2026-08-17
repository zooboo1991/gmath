/**
 * POST /api/account/register — src/app/api/account/register/route.ts
 *
 * The OTP check here is the real one: the phone-verification screen in front
 * of it is only UX, and a hand-written request goes straight to this handler.
 * Everything else is field validation, which matters because these fields go
 * on to a certificate and an SMS.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient } from "../../support/client";
import { cleanupTracked, testDb } from "../../support/db";
import {
  createTestUser,
  makePhone,
  readOtp,
  seedVerifiedOtp,
  trackUserByPhone,
} from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

function registerBody(phone: string, overrides: Record<string, unknown> = {}) {
  return {
    role: "student",
    lastName: "Дорж",
    firstName: "Болд",
    province: "Улаанбаатар",
    district: "Сүхбаатар",
    school: "1-р сургууль",
    grade: "8",
    phone,
    email: `student-${phone}@example.test`,
    facebook: "",
    password: "Test1234",
    passwordConfirm: "Test1234",
    ...overrides,
  };
}

async function userExists(phone: string): Promise<boolean> {
  const { data } = await testDb().from("users").select("id").eq("phone", phone).maybeSingle();
  return Boolean(data);
}

describe("phone verification is enforced server-side", () => {
  it("refuses a registration with no verified OTP, and creates nothing", async () => {
    const phone = makePhone();
    const res = await anonClient().post<{ ok: boolean; errors: Record<string, string> }>(
      "/api/account/register",
      registerBody(phone)
    );

    expect(res.status).toBe(400);
    expect(res.body.errors.phone).toBeTruthy();
    expect(await userExists(phone)).toBe(false);
  });

  it("refuses an OTP that was verified but never for this purpose", async () => {
    const phone = makePhone();
    // Verified for a password reset, not for registration.
    await seedVerifiedOtp(phone, "reset");

    const res = await anonClient().post("/api/account/register", registerBody(phone));
    expect(res.status).toBe(400);
    expect(await userExists(phone)).toBe(false);
  });

  it("refuses an OTP verified longer ago than the 15 minute window", async () => {
    const phone = makePhone();
    await seedVerifiedOtp(phone, "register", {
      verifiedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    });

    const res = await anonClient().post("/api/account/register", registerBody(phone));
    expect(res.status).toBe(400);
    expect(await userExists(phone)).toBe(false);
  });

  it("registers with a verified OTP, consumes it, and refuses to reuse it", async () => {
    const phone = makePhone();
    const otp = await seedVerifiedOtp(phone, "register");

    const client = anonClient();
    const res = await client.post<{ ok: boolean; user: { id: string } }>(
      "/api/account/register",
      registerBody(phone)
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    await trackUserByPhone(phone);

    // Signed in straight away.
    expect(client.getCookie("session_user_id")).toBeTruthy();
    const me = await client.get<{ user: { id: string } | null }>("/api/account/me");
    expect(me.body.user?.id).toBe(res.body.user.id);

    // The code is spent — a second account cannot be opened on the strength
    // of the same verification.
    expect((await readOtp(otp.id))?.consumed_at).toBeTruthy();
    const replay = await anonClient().post("/api/account/register", registerBody(makePhone()));
    expect(replay.status).toBe(400);
  });

  it("does not spend the OTP when the rest of the form is invalid", async () => {
    const phone = makePhone();
    const otp = await seedVerifiedOtp(phone, "register");

    const rejected = await anonClient().post(
      "/api/account/register",
      registerBody(phone, { email: "not-an-email" })
    );
    expect(rejected.status).toBe(400);
    expect((await readOtp(otp.id))?.consumed_at).toBeNull();

    // Fixing the form and resubmitting still works — the student is not sent
    // back to the SMS step because of their own typo.
    const accepted = await anonClient().post("/api/account/register", registerBody(phone));
    expect(accepted.status).toBe(200);
    await trackUserByPhone(phone);
  });
});

describe("duplicate accounts", () => {
  it("refuses a phone number that already has an account", async () => {
    const existing = await createTestUser();
    await seedVerifiedOtp(existing.phone, "register");

    const res = await anonClient().post<{ errors: Record<string, string> }>(
      "/api/account/register",
      registerBody(existing.phone)
    );
    expect(res.status).toBe(409);
    expect(res.body.errors.phone).toBeTruthy();
  });
});

describe("field validation", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["missing role", { role: undefined }, "role"],
    ["unknown role", { role: "admin" }, "role"],
    ["empty last name", { lastName: "   " }, "lastName"],
    ["last name over MAX_LEN.name", { lastName: "х".repeat(51) }, "lastName"],
    ["empty first name", { firstName: "" }, "firstName"],
    ["first name over MAX_LEN.name", { firstName: "х".repeat(51) }, "firstName"],
    ["empty province", { province: "" }, "province"],
    ["province over MAX_LEN.province", { province: "х".repeat(61) }, "province"],
    ["empty district", { district: "" }, "district"],
    ["empty school", { school: "" }, "school"],
    ["school over MAX_LEN.school", { school: "х".repeat(151) }, "school"],
    ["student with no grade", { grade: "" }, "grade"],
    ["grade over MAX_LEN.name", { grade: "8".repeat(51) }, "grade"],
    ["phone with letters", { phone: "abcdefgh" }, "phone"],
    ["email without @", { email: "student.example.test" }, "email"],
    ["email over MAX_LEN.email", { email: `${"a".repeat(250)}@e.test` }, "email"],
    ["facebook over MAX_LEN.social", { facebook: "f".repeat(101) }, "facebook"],
    ["password with no uppercase", { password: "test1234", passwordConfirm: "test1234" }, "password"],
    ["password with no digit", { password: "TestTest", passwordConfirm: "TestTest" }, "password"],
    ["password under 6 characters", { password: "Te1", passwordConfirm: "Te1" }, "password"],
    [
      "password over MAX_LEN.password",
      { password: `Aa1${"x".repeat(200)}`, passwordConfirm: `Aa1${"x".repeat(200)}` },
      "password",
    ],
    ["confirmation that does not match", { passwordConfirm: "Test12345" }, "passwordConfirm"],
  ];

  for (const [name, overrides, expectedKey] of cases) {
    it(`refuses ${name}`, async () => {
      const phone = makePhone();
      // A verified OTP is in place, so a 400 can only be about the field
      // under test.
      await seedVerifiedOtp(phone, "register");

      const body = registerBody(phone, overrides);
      if (overrides.role === undefined && "role" in overrides) delete (body as Record<string, unknown>).role;

      const res = await anonClient().post<{ errors: Record<string, string> }>(
        "/api/account/register",
        body
      );
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.errors)).toContain(expectedKey);
      expect(await userExists(phone)).toBe(false);
    });
  }

  it("lets a teacher register without a grade", async () => {
    const phone = makePhone();
    await seedVerifiedOtp(phone, "register");

    const res = await anonClient().post(
      "/api/account/register",
      registerBody(phone, { role: "teacher", grade: "" })
    );
    expect(res.status).toBe(200);
    await trackUserByPhone(phone);
  });
});
