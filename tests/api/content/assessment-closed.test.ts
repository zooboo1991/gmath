/**
 * The level test's kill switch (`assessment_enabled` in app_settings).
 *
 * Closed while the problem bank is being rewritten: a child must not be handed
 * a test that is half-replaced, and a parent must not pay for one. "Hidden" is
 * not enough — the pages are only the part people see, so what matters here is
 * that every endpoint behind them refuses too, including the free taster,
 * which has no session to gate on.
 *
 * The switch is restored to "on" after each test: leaving the test project
 * closed would make unrelated assessment tests fail for a reason that has
 * nothing to do with them.
 */

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb } from "../../support/db";
import { createTestAssessment, createTestUser } from "../../support/factories";

async function setSwitch(value: "on" | "off") {
  const { error } = await testDb()
    .from("app_settings")
    .upsert({ key: "assessment_enabled", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

afterEach(async () => {
  await setSwitch("on");
});

afterAll(async () => {
  await setSwitch("on");
  await cleanupTracked();
});

describe("while the test is closed", () => {
  it("turns away a student part-way through their own assessment", async () => {
    const user = await createTestUser();
    const assessment = await createTestAssessment({ userId: user.id, status: "paid" });
    const client = await signedInClient(user.phone, user.password);

    // Open: their own assessment is reachable.
    expect((await client.get(`/api/assessment/${assessment.id}/solutions`)).status).toBe(200);

    await setSwitch("off");

    const res = await client.get<{ error: string }>(`/api/assessment/${assessment.id}/solutions`);
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("түр хаалттай");
  });

  it("refuses to start a new one", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    await setSwitch("off");

    expect((await client.post("/api/assessment", { track: "regular", grade: 5 })).status).toBe(503);
    expect((await client.get("/api/assessment")).status).toBe(503);
  });

  it("closes the free taster, which has no login to hide behind", async () => {
    await setSwitch("off");

    expect((await anonClient().get("/api/assessment/sample?grade=5&track=regular")).status).toBe(503);
    expect(
      (await anonClient().post("/api/assessment/sample/score", { grade: 5, track: "regular", answers: [] })).status
    ).toBe(503);
  });

  it("shows the closed notice on the page instead of the test", async () => {
    await setSwitch("off");

    const res = await anonClient().get("/assessment");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Түр хаалттай");
    // The thing that starts a test must not be on the page at all.
    expect(res.text).not.toContain("Үнэлгээ эхлүүлэх");
  });

  it("keeps the page working normally once it is open again", async () => {
    await setSwitch("off");
    await setSwitch("on");

    const res = await anonClient().get("/assessment");

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("Түр хаалттай байна");
  });

  it("drops /assessment from the sitemap", async () => {
    await setSwitch("off");
    const closed = await anonClient().get("/sitemap.xml");
    expect(closed.text).not.toContain("/assessment");

    await setSwitch("on");
    const open = await anonClient().get("/sitemap.xml");
    expect(open.text).toContain("/assessment");
  });
});

describe("the switch itself", () => {
  it("is off only when it says exactly 'off'", async () => {
    // A missing row, or any other value, has to read as open — a typo in this
    // setting must never take the feature away silently.
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    for (const value of ["on", "ON", "true", ""] as const) {
      await testDb()
        .from("app_settings")
        .upsert({ key: "assessment_enabled", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      expect((await client.get("/api/assessment")).status, `value=${JSON.stringify(value)}`).toBe(200);
    }
  });

  it("is flipped by a full admin and nobody else", async () => {
    const viewer = await adminClient("viewer");
    expect(
      (await viewer.put("/api/admin/settings", { key: "assessment_enabled", value: "off" })).status
    ).toBe(401);
    expect(
      (await anonClient().put("/api/admin/settings", { key: "assessment_enabled", value: "off" })).status
    ).toBe(401);

    const admin = await adminClient("full");
    expect((await admin.put("/api/admin/settings", { key: "assessment_enabled", value: "off" })).status).toBe(200);

    const read = await admin.get<{ settings: Record<string, string> }>("/api/admin/settings");
    expect(read.body.settings.assessment_enabled).toBe("off");

    // And a student is now turned away — the toggle is wired to the behaviour,
    // not just to a row in a table.
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    expect((await client.get("/api/assessment")).status).toBe(503);
  });

  it("does not touch anything else on the site", async () => {
    await setSwitch("off");
    for (const path of ["/", "/courses", "/certificate", "/articles"]) {
      expect((await anonClient().get(path)).status, path).toBe(200);
    }
    // A random uuid still 404s rather than 503 — closing is not a blanket
    // catch-all that swallows other failures.
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    await setSwitch("on");
    expect((await client.get(`/api/assessment/${randomUUID()}/solutions`)).status).toBe(404);
  });
});
