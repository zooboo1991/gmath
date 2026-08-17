/**
 * /api/account/registrations and /api/account/profile.
 *
 * Neither takes a user id — both work off the session — so the risk isn't a
 * guessable id in the URL but a field smuggled into the body that the handler
 * trusts. These tests send exactly those fields and check nothing moved.
 *
 * The registrations payload is also a content gate in its own right: the Zoom
 * link and Facebook group are attached server-side only for a confirmed
 * registration, so an unpaid student cannot read the class link out of the
 * network response.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient, signedInClient } from "../../support/client";
import { cleanupTracked } from "../../support/db";
import {
  createTestCourse,
  createTestRegistration,
  createTestUser,
  readUser,
} from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

const ZOOM_LINK = "https://zoom.us/j/9876543210";
const FACEBOOK_GROUP = "https://facebook.com/groups/secret-class";

async function courseWithPerks() {
  return createTestCourse({
    zoomLink: ZOOM_LINK,
    lessons: [{ topic: "Хичээл 1", zoomLink: ZOOM_LINK, recordingLink: "https://drive.google.com/x" }],
  });
}

describe("GET /api/account/registrations", () => {
  it("refuses a signed-out visitor", async () => {
    const res = await anonClient().get("/api/account/registrations");
    expect(res.status).toBe(401);
  });

  it("returns only the signed-in student's own registrations", async () => {
    const course = await createTestCourse();
    const mine = await createTestUser();
    const theirs = await createTestUser();

    const ownRegistration = await createTestRegistration({
      userId: mine.id,
      programId: course.id,
      status: "active",
    });
    const otherRegistration = await createTestRegistration({
      userId: theirs.id,
      programId: course.id,
      status: "active",
    });

    const client = await signedInClient(mine.phone, mine.password);
    const res = await client.get<{ registrations: { id: string; userId: string }[] }>(
      "/api/account/registrations"
    );

    expect(res.status).toBe(200);
    expect(res.body.registrations.map((r) => r.id)).toEqual([ownRegistration.id]);
    expect(res.text).not.toContain(otherRegistration.id);
    expect(res.text).not.toContain(theirs.id);
  });

  it("withholds the Zoom link and group from a pending registration", async () => {
    const course = await courseWithPerks();
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "pending" });

    const client = await signedInClient(student.phone, student.password);
    const res = await client.get<{ registrations: Record<string, unknown>[] }>(
      "/api/account/registrations"
    );

    expect(res.status).toBe(200);
    expect(res.body.registrations).toHaveLength(1);
    const [registration] = res.body.registrations;
    expect(registration.zoomLink).toBeUndefined();
    expect(registration.facebookGroup).toBeUndefined();
    expect(registration.lessons).toBeUndefined();
    // Belt and braces: the link must not appear anywhere in the payload.
    expect(res.text).not.toContain(ZOOM_LINK);
  });

  it("includes them once the registration is active", async () => {
    const course = await createTestCourse({ zoomLink: ZOOM_LINK });
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "active" });

    const client = await signedInClient(student.phone, student.password);
    const res = await client.get<{ registrations: Record<string, unknown>[] }>(
      "/api/account/registrations"
    );

    expect(res.body.registrations[0].zoomLink).toBe(ZOOM_LINK);
  });
});

describe("PUT /api/account/profile", () => {
  const validProfile = {
    lastName: "Дорж",
    firstName: "Болд",
    province: "Улаанбаатар",
    district: "Сүхбаатар",
    school: "1-р сургууль",
    grade: "9",
    email: "updated@example.test",
    facebook: "",
  };

  it("refuses a signed-out visitor", async () => {
    const res = await anonClient().put("/api/account/profile", validProfile);
    expect(res.status).toBe(401);
  });

  it("edits the signed-in account and no other", async () => {
    const mine = await createTestUser();
    const theirs = await createTestUser();
    const before = await readUser(theirs.id);

    const client = await signedInClient(mine.phone, mine.password);
    // Every id-shaped field an attacker might hope the handler trusts.
    const res = await client.put("/api/account/profile", {
      ...validProfile,
      id: theirs.id,
      userId: theirs.id,
      user_id: theirs.id,
    });

    expect(res.status).toBe(200);
    const after = await readUser(theirs.id);
    expect(after).toEqual(before);
    expect((await readUser(mine.id))?.first_name).toBe("Болд");
  });

  it("ignores an attempt to change the phone number the account is keyed on", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    const res = await client.put("/api/account/profile", { ...validProfile, phone: "99999999" });
    expect(res.status).toBe(200);
    // The phone is the login identifier and the key certificates are matched
    // on; the profile form must not be a way to take over another number.
    expect((await readUser(user.id))?.phone).toBe(user.phone);
  });

  it("ignores an attempt to promote the account to teacher", async () => {
    const user = await createTestUser({ role: "student" });
    const client = await signedInClient(user.phone, user.password);

    const res = await client.put("/api/account/profile", { ...validProfile, role: "teacher" });
    expect(res.status).toBe(200);
    expect((await readUser(user.id))?.role).toBe("student");
  });

  it("ignores an attempt to overwrite the password through the profile form", async () => {
    const user = await createTestUser();
    const before = await readUser(user.id);
    const client = await signedInClient(user.phone, user.password);

    const res = await client.put("/api/account/profile", {
      ...validProfile,
      password: "Hacked123",
      password_hash: "deadbeef",
      passwordHash: "deadbeef",
    });
    expect(res.status).toBe(200);
    expect((await readUser(user.id))?.password_hash).toBe(before?.password_hash);

    // The original password still signs in; the injected one does not.
    expect((await anonClient().post("/api/account/login", { phone: user.phone, password: user.password })).status).toBe(200);
    expect(
      (await anonClient().post("/api/account/login", { phone: user.phone, password: "Hacked123" })).status
    ).toBe(401);
  });

  describe("validation", () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ["empty last name", { lastName: "" }, "lastName"],
      ["last name over MAX_LEN.name", { lastName: "х".repeat(51) }, "lastName"],
      ["empty first name", { firstName: "  " }, "firstName"],
      ["empty province", { province: "" }, "province"],
      ["province over MAX_LEN.province", { province: "х".repeat(61) }, "province"],
      ["empty district", { district: "" }, "district"],
      ["empty school", { school: "" }, "school"],
      ["school over MAX_LEN.school", { school: "х".repeat(151) }, "school"],
      ["student with no grade", { grade: "" }, "grade"],
      ["bad email", { email: "nope" }, "email"],
      ["facebook over MAX_LEN.social", { facebook: "f".repeat(101) }, "facebook"],
    ];

    for (const [name, overrides, expectedKey] of cases) {
      it(`refuses ${name} and changes nothing`, async () => {
        const user = await createTestUser();
        const before = await readUser(user.id);
        const client = await signedInClient(user.phone, user.password);

        const res = await client.put<{ errors: Record<string, string> }>("/api/account/profile", {
          ...validProfile,
          ...overrides,
        });

        expect(res.status).toBe(400);
        expect(Object.keys(res.body.errors)).toContain(expectedKey);
        expect(await readUser(user.id)).toEqual(before);
      });
    }

    it("lets a teacher save without a grade", async () => {
      const teacher = await createTestUser({ role: "teacher" });
      const client = await signedInClient(teacher.phone, teacher.password);

      const res = await client.put("/api/account/profile", { ...validProfile, grade: "" });
      expect(res.status).toBe(200);
    });
  });
});
