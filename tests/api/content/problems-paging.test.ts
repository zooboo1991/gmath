/**
 * The problem bank past PostgREST's 1000-row ceiling.
 *
 * A request returns at most 1000 rows and says nothing about the ones it left
 * behind, so any read of the whole `problems` table quietly becomes "the
 * oldest thousand". The bank is ordered by created_at, which sends the newest
 * problem — the one the teacher has just typed — over the edge first: editing
 * it answered «Бодлого олдсонгүй» while the row sat in the table (BUGS.md #7).
 *
 * This file seeds a bank of its own, one row past the ceiling, so the property
 * holds whatever the test database happens to contain. Leaning on the ambient
 * row count is what made this look like a flaky category test: fixtures left
 * by earlier runs happened to cross 1000, and the day someone tidies the table
 * a test written that way stops proving anything.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient } from "../../support/client";
import { cleanupTracked, testDb, track, trackBy } from "../../support/db";

/** One more than fetchAllRows' page, so this file's own rows cross it. */
const OVER_ONE_PAGE = 1001;

/**
 * The topic every seeded row carries. Cleanup is then one filtered delete
 * rather than 1001 deletes by id — and a run killed half way leaves a batch
 * with a name a person can recognise and sweep in a single query.
 */
const MARKER = `Хуудаслалтын тест ${randomUUID()}`;

/**
 * A thousand and one problems in one INSERT. Cheap enough to pay on every run,
 * which is the whole argument for seeding rather than trusting whatever the
 * table already holds.
 */
async function seedOverOnePage(): Promise<void> {
  // Registered before the write, not after: a seed that fails part way through
  // still has to be cleaned up.
  trackBy("problems", "topic", MARKER);
  const rows = Array.from({ length: OVER_ONE_PAGE }, () => ({
    category: "C",
    topic: MARKER,
    body_latex: "1+1=?",
    active: true,
  }));
  const { error } = await testDb().from("problems").insert(rows);
  if (error) throw new Error(`seedOverOnePage failed: ${error.message}`);
}

beforeAll(async () => {
  await seedOverOnePage();
});

afterAll(async () => {
  await cleanupTracked();
});

describe("a problem bank past the 1000-row ceiling", () => {
  it("still lets the admin edit the problem they just entered", async () => {
    const admin = await adminClient("full");

    // Created through the real endpoint, so it lands after every seeded row:
    // the newest problem in the bank, and the first one a truncated read loses.
    const created = await admin.post<{ problem: { id: string } }>("/api/admin/problems", {
      category: "D",
      topic: `${MARKER} шинэ`,
      bodyLatex: "$a^2 + b^2$",
    });
    expect(created.status, created.text).toBe(200);
    track("problems", created.body.problem.id);

    const updated = await admin.put<{ problem: { topic: string } }>(
      `/api/admin/problems/${created.body.problem.id}`,
      { topic: `${MARKER} зассан` }
    );

    expect(updated.status, updated.text).toBe(200);
    expect(updated.body.problem.topic).toBe(`${MARKER} зассан`);

    // And the edit reached the row, not only the response.
    const { data } = await testDb()
      .from("problems")
      .select("topic")
      .eq("id", created.body.problem.id)
      .single();
    expect((data as { topic: string }).topic).toBe(`${MARKER} зассан`);
  });

  it("lists every problem, not the oldest thousand", async () => {
    const admin = await adminClient("full");

    const created = await admin.post<{ problem: { id: string } }>("/api/admin/problems", {
      category: "C",
      topic: `${MARKER} сүүлчийн`,
      bodyLatex: "1+1=?",
    });
    expect(created.status, created.text).toBe(200);
    track("problems", created.body.problem.id);

    const listed = await admin.get<{ problems: { id: string; topic: string }[] }>(
      "/api/admin/problems"
    );
    expect(listed.status, listed.text).toBe(200);

    const ids = listed.body.problems.map((p) => p.id);

    // The newest row is the one the ceiling takes first.
    expect(ids).toContain(created.body.problem.id);

    // Every seeded row, exactly once. They share a created_at — one INSERT is
    // one now() — so ordering by created_at alone leaves the page boundary
    // free to hand back one row twice and drop another; the id tiebreaker is
    // what makes the pages line up.
    const seeded = listed.body.problems.filter((p) => p.topic === MARKER);
    expect(seeded).toHaveLength(OVER_ONE_PAGE);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// A second describe. It needs no seeded bank — it is about the shape of the id
// lookup, not the ceiling — but it belongs beside the change that introduced
// the lookup.
describe("looking a problem up by id", () => {
  it("answers a malformed id with 'not found' rather than a crash", async () => {
    const admin = await adminClient("full");

    // problems.id is a uuid column, so Postgres raises 22P02 on anything that
    // is not one. That is a mistyped URL, not a server fault: the admin gets
    // the same «олдсонгүй» a stranger's uuid would earn them.
    const res = await admin.put<{ error: string }>("/api/admin/problems/not-a-uuid", {
      topic: `${MARKER} байхгүй`,
    });

    expect(res.status, res.text).toBe(404);
    expect(res.body.error).toBe("Бодлого олдсонгүй");
  });
});
