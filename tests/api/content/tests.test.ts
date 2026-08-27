/**
 * Тестийн үр дүн хадгалах зам.
 *
 * The score is worked out on the server: a page can be edited, so a sheet
 * that arrives claiming to be a Геометрч is scored again here from the
 * answers before anything is written down.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb } from "../../support/db";
import { createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

const SLUG = "matematik-arhetip";
/** Twelve answers, varied enough that one archetype leads. */
const SHEET = [3, 1, 2, 0, 3, 0, 2, 0, 3, 1, 1, 2];

async function storedResult(userId: string) {
  const { data } = await testDb()
    .from("personality_results")
    .select("*")
    .eq("user_id", userId)
    .eq("test_slug", SLUG)
    .maybeSingle();
  return data as {
    answers: number[];
    scores: Record<string, number>;
    primary_code: string;
    secondary_code: string | null;
  } | null;
}

describe("saving a finished test", () => {
  it("refuses a visitor who is not signed in", async () => {
    const res = await anonClient().post(`/api/tests/${SLUG}/result`, { answers: SHEET });
    expect(res.status).toBe(401);
  });

  it("stores the sheet with the score worked out here", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    const res = await client.post(`/api/tests/${SLUG}/result`, { answers: SHEET });
    expect(res.status, res.text).toBe(200);

    const stored = await storedResult(user.id);
    expect(stored?.answers).toEqual(SHEET);
    expect(stored?.primary_code).toBeTruthy();
    expect(stored?.secondary_code).toBeTruthy();
    // Points, not a label the client could have made up.
    expect(Object.values(stored?.scores ?? {}).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("replaces the earlier sheet when the test is taken again", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    await client.post(`/api/tests/${SLUG}/result`, { answers: SHEET });
    const second = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const res = await client.post(`/api/tests/${SLUG}/result`, { answers: second });
    expect(res.status, res.text).toBe(200);

    const { data } = await testDb()
      .from("personality_results")
      .select("id")
      .eq("user_id", user.id)
      .eq("test_slug", SLUG);
    expect((data ?? []).length, "нэг хүнд нэг тестээс нэг мөр").toBe(1);
    expect((await storedResult(user.id))?.answers).toEqual(second);
  });

  it("refuses a half-finished or hand-edited sheet", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    for (const answers of [[0, 1, 2], SHEET.map(() => 9), "0,1", null]) {
      const res = await client.post(`/api/tests/${SLUG}/result`, { answers });
      expect(res.status, JSON.stringify(answers)).toBe(400);
    }
    expect(await storedResult(user.id)).toBeNull();
  });

  it("answers 404 for a test that does not exist", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    const res = await client.post("/api/tests/baihgui-test/result", { answers: SHEET });
    expect(res.status).toBe(404);
  });
});
