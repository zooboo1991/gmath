/**
 * /api/assessment/[id]/* — src/lib/assessment/guard.ts.
 *
 * The id is a UUID in the URL and every one of these routes is reachable by
 * anyone signed in, so `requireOwnAssessment` is the only thing standing
 * between one student and another's test paper, their handwritten solutions,
 * their level and the teacher's comments about them.
 *
 * These are children's records: the failure mode isn't only "the wrong page
 * loads", it's a child's schoolwork and assessed level in a stranger's hands.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked } from "../../support/db";
import { createTestAssessment, createTestUser } from "../../support/factories";
import { listMockInvoices } from "../../support/mockControl";

afterAll(async () => {
  await cleanupTracked();
});

/** Every /api/assessment/[id]/* entry point, with a body where one is needed. */
const ROUTES: { name: string; method: "GET" | "POST"; path: (id: string) => string; body?: unknown }[] = [
  { name: "solutions (read)", method: "GET", path: (id) => `/api/assessment/${id}/solutions` },
  { name: "submit", method: "POST", path: (id) => `/api/assessment/${id}/submit` },
  { name: "quiz (read)", method: "GET", path: (id) => `/api/assessment/${id}/quiz` },
  {
    name: "quiz submit",
    method: "POST",
    path: (id) => `/api/assessment/${id}/quiz/submit`,
    body: { answers: [] },
  },
  {
    name: "questionnaire",
    method: "POST",
    path: (id) => `/api/assessment/${id}/questionnaire`,
    body: { age: 12 },
  },
  { name: "next problem", method: "GET", path: (id) => `/api/assessment/${id}/next-problem` },
  {
    name: "problem action",
    method: "POST",
    path: (id) => `/api/assessment/${id}/problem-action`,
    body: { problemId: randomUUID(), action: "solve" },
  },
  { name: "pay", method: "POST", path: (id) => `/api/assessment/${id}/pay` },
  { name: "pay check", method: "POST", path: (id) => `/api/assessment/${id}/pay/check` },
];

function call(client: TestClient, route: (typeof ROUTES)[number], id: string) {
  return route.method === "GET" ? client.get(route.path(id)) : client.post(route.path(id), route.body);
}

describe("another student's assessment", () => {
  for (const route of ROUTES) {
    it(`${route.name}: answers 404, not 403`, async () => {
      const owner = await createTestUser();
      const assessment = await createTestAssessment({
        userId: owner.id,
        status: "questionnaire_done",
      });

      const stranger = await createTestUser();
      const client = await signedInClient(stranger.phone, stranger.password);

      const res = await call(client, route, assessment.id);
      // 404 rather than 403: the response must not confirm the id is real.
      expect(res.status).toBe(404);
    });
  }

  it("answers an id that belongs to nobody exactly as it answers someone else's", async () => {
    const owner = await createTestUser();
    const assessment = await createTestAssessment({ userId: owner.id });
    const stranger = await createTestUser();
    const client = await signedInClient(stranger.phone, stranger.password);

    const someoneElses = await client.get<{ error: string }>(
      `/api/assessment/${assessment.id}/solutions`
    );
    const nonexistent = await client.get<{ error: string }>(`/api/assessment/${randomUUID()}/solutions`);

    expect(nonexistent.status).toBe(someoneElses.status);
    expect(nonexistent.body.error).toBe(someoneElses.body.error);
  });

  it("does not crash on an id that is not a UUID", async () => {
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    for (const id of ["not-a-uuid", "1", "%20", "null"]) {
      const res = await client.get(`/api/assessment/${id}/solutions`);
      expect(res.status, `id=${id}`).toBe(404);
    }
  });
});

describe("signed-out access", () => {
  for (const route of ROUTES) {
    it(`${route.name}: answers 401`, async () => {
      const owner = await createTestUser();
      const assessment = await createTestAssessment({ userId: owner.id });

      const res = await call(anonClient(), route, assessment.id);
      expect(res.status).toBe(401);
    });
  }
});

describe("paying for someone else's assessment", () => {
  it("creates no invoice at all", async () => {
    const owner = await createTestUser();
    const assessment = await createTestAssessment({
      userId: owner.id,
      status: "awaiting_payment",
    });

    const before = (await listMockInvoices()).length;

    const stranger = await createTestUser();
    const client = await signedInClient(stranger.phone, stranger.password);
    const res = await client.post(`/api/assessment/${assessment.id}/pay`);

    expect(res.status).toBe(404);
    // Not merely refused — QPay was never contacted, so no invoice exists
    // that anyone could pay against this assessment.
    expect((await listMockInvoices()).length).toBe(before);
  });
});

describe("step order (own assessment, wrong state)", () => {
  it("refuses to upload solutions before the questionnaire is done", async () => {
    const student = await createTestUser();
    const assessment = await createTestAssessment({ userId: student.id, status: "paid" });
    const client = await signedInClient(student.phone, student.password);

    const form = new FormData();
    form.set("problemId", randomUUID());
    const res = await client.postForm(`/api/assessment/${assessment.id}/solutions`, form);

    // 409 (not 404): it is their own assessment, just not at that step yet.
    expect(res.status).toBe(409);
  });

  it("refuses to submit work that was already submitted", async () => {
    const student = await createTestUser();
    const assessment = await createTestAssessment({
      userId: student.id,
      status: "problems_submitted",
    });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post(`/api/assessment/${assessment.id}/submit`);
    expect(res.status).toBe(409);
  });

  it("refuses to pay for an assessment that is already paid", async () => {
    const student = await createTestUser();
    const assessment = await createTestAssessment({ userId: student.id, status: "paid" });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post(`/api/assessment/${assessment.id}/pay`);
    expect(res.status).toBe(409);
  });
});

describe("GET /api/assessment", () => {
  it("refuses a signed-out visitor", async () => {
    const res = await anonClient().get("/api/assessment");
    expect(res.status).toBe(401);
  });

  it("never returns another student's open assessment", async () => {
    const owner = await createTestUser();
    const theirs = await createTestAssessment({ userId: owner.id, status: "paid" });

    const other = await createTestUser();
    const client = await signedInClient(other.phone, other.password);

    const res = await client.get<{ assessment: { id: string } | null }>("/api/assessment");
    expect(res.status).toBe(200);
    expect(res.body.assessment).toBeNull();
    expect(res.text).not.toContain(theirs.id);
  });
});
