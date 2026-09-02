/**
 * POST /api/account/onboarding — эхлэлийн чеклистийн алхам тэмдэглэх.
 *
 * Энэ бол сурагч өөрөө бичдэг цөөн endpoint-ийн нэг тул гол асуулт нь:
 * өөр хүний, эсвэл төлбөрөө төлөөгүй сургалт дээр бичиж чадах уу.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

async function stepsOf(userId: string): Promise<{ step: string; done: boolean; program: string }[]> {
  const { data } = await testDb()
    .from("course_onboarding_steps")
    .select("id, step, done, program_id")
    .eq("user_id", userId);
  const rows = (data ?? []) as { id: string; step: string; done: boolean; program_id: string }[];
  for (const row of rows) track("course_onboarding_steps", row.id);
  return rows.map((r) => ({ step: r.step, done: r.done, program: r.program_id }));
}

/** Идэвхтэй бүртгэлтэй сурагч — чеклист харах эрхтэй хүн. */
async function activeStudent() {
  const course = await createTestCourse();
  const student = await createTestUser();
  await createTestRegistration({
    userId: student.id,
    programId: course.id,
    status: "active",
  });
  const client = await signedInClient(student.phone, student.password);
  return { course, student, client };
}

describe("хандах эрх", () => {
  it("нэвтрээгүй зочныг няцаана", async () => {
    const res = await anonClient().post("/api/account/onboarding", {
      programId: "x",
      step: "zoom",
      done: true,
    });
    expect(res.status).toBe(401);
  });

  it("бүртгэлгүй сургалт дээр тэмдэглэхийг 404-өөр няцаана", async () => {
    const { course } = await activeStudent();
    const outsider = await createTestUser();
    const client = await signedInClient(outsider.phone, outsider.password);

    const res = await client.post("/api/account/onboarding", {
      programId: course.id,
      step: "zoom",
      done: true,
    });

    // 403 биш 404: ямар сургалт байгааг мэдэгдэх ёсгүй.
    expect(res.status).toBe(404);
    expect((await stepsOf(outsider.id)).length).toBe(0);
  });

  it("төлбөр нь баталгаажаагүй сурагчийг няцаана", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "pending" });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post("/api/account/onboarding", {
      programId: course.id,
      step: "facebook",
      done: true,
    });

    expect(res.status).toBe(404);
    expect((await stepsOf(student.id)).length).toBe(0);
  });

  it("танихгүй алхмыг хүлээж авахгүй", async () => {
    const { course, client } = await activeStudent();
    for (const step of ["", "хакер", "certificate", 5]) {
      const res = await client.post("/api/account/onboarding", { programId: course.id, step, done: true });
      expect(res.status, String(step)).toBe(400);
    }
  });

  it("done нь заавал boolean байна", async () => {
    const { course, client } = await activeStudent();
    const res = await client.post("/api/account/onboarding", { programId: course.id, step: "zoom" });
    expect(res.status).toBe(400);
  });
});

describe("алхам тэмдэглэх", () => {
  it("тэмдэглээд буцааж болно, мөр давхардахгүй", async () => {
    const { course, student, client } = await activeStudent();

    expect(
      (await client.post("/api/account/onboarding", { programId: course.id, step: "zoom", done: true })).status
    ).toBe(200);
    expect(await stepsOf(student.id)).toEqual([{ step: "zoom", done: true, program: course.id }]);

    // Дахин дарахад шинэ мөр биш, байгаа мөр нь шинэчлэгдэнэ.
    expect(
      (await client.post("/api/account/onboarding", { programId: course.id, step: "zoom", done: false })).status
    ).toBe(200);
    expect(await stepsOf(student.id)).toEqual([{ step: "zoom", done: false, program: course.id }]);
  });

  it("гурван алхам тус тусдаа хадгалагдана", async () => {
    const { course, student, client } = await activeStudent();
    for (const step of ["facebook", "schedule", "zoom"]) {
      await client.post("/api/account/onboarding", { programId: course.id, step, done: true });
    }
    const saved = await stepsOf(student.id);
    expect(saved.map((s) => s.step).sort()).toEqual(["facebook", "schedule", "zoom"]);
    expect(saved.every((s) => s.done)).toBe(true);
  });

  it("санамсаргүй хоёр удаа дарахад алдаа гарахгүй", async () => {
    const { course, student, client } = await activeStudent();
    const body = { programId: course.id, step: "schedule", done: true };
    const [a, b] = await Promise.all([
      client.post("/api/account/onboarding", body),
      client.post("/api/account/onboarding", body),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await stepsOf(student.id)).length).toBe(1);
  });
});

describe("профайл дээр харагдах нь", () => {
  it("шинэ сурагчид чеклист гарна", async () => {
    const { client } = await activeStudent();
    const page = await client.get("/profile");
    expect(page.status).toBe(200);
    expect(page.text).toContain("Эхлэхэд туслах гурван алхам");
    expect(page.text).toContain("Facebook группт нэгдэх");
    expect(page.text).toContain("zoom.us/test");
  });

  it("гурван алхам дуусмагц алга болно", async () => {
    const { course, client } = await activeStudent();
    // Курст Facebook групп ороогүй тул тэр алхам тоологдохгүй — үлдсэн хоёрыг
    // тэмдэглэхэд карт дуусна.
    for (const step of ["schedule", "zoom"]) {
      await client.post("/api/account/onboarding", { programId: course.id, step, done: true });
    }
    const page = await client.get("/profile");
    expect(page.text).not.toContain("Эхлэхэд туслах гурван алхам");
  });

  it("идэвхтэй сургалтгүй хүнд гарахгүй", async () => {
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    const page = await client.get("/profile");
    expect(page.status).toBe(200);
    expect(page.text).not.toContain("Эхлэхэд туслах гурван алхам");
  });
});
