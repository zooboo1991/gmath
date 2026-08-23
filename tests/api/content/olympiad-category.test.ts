/**
 * The olympiad problem bank, split by category.
 *
 * C is 5th-6th grade and D is 7th-8th — the year-long programme the child is
 * preparing for. A child must be shown problems from their own bank and no
 * other: a 5th grader handed D problems has been failed by the system before
 * they wrote anything, and the level they are then assigned is meaningless.
 *
 * The category is taken from the profile grade and frozen onto the assessment
 * at the moment it starts, so a later profile edit cannot change which bank a
 * half-finished assessment is being graded against.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

/**
 * Problems are created before the student who will be shown them, on purpose:
 * cleanup deletes in reverse, so the user (and the assessment_problems rows
 * cascading from them) goes first and the problems are then free of the
 * foreign key that would otherwise refuse the delete.
 */
async function createProblem(category: "C" | "D" | null, difficulty: number, topic: string) {
  const { data, error } = await testDb()
    .from("problems")
    .insert({
      category,
      level: Math.min(10, Math.max(1, Math.round(difficulty))),
      difficulty,
      topic,
      body_latex: `Бодлого: ${topic}`,
      active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createProblem failed: ${error.message}`);
  const id = (data as { id: string }).id;
  track("problems", id);
  return id;
}

/** The olympiad flow up to the point problems start being served. */
async function startOlympiad(grade: string) {
  const user = await createTestUser({ grade });
  const client = await signedInClient(user.phone, user.password);
  const started = await client.post<{ assessment?: { id: string; category?: string }; error?: string }>(
    "/api/assessment",
    { track: "olympiad" }
  );
  return { user, client, started };
}

/** Walks the assessment to `questionnaire_done`, which is when problems are shown. */
async function reachPickingPhase(assessmentId: string) {
  const { error } = await testDb()
    .from("assessments")
    .update({ status: "questionnaire_done" })
    .eq("id", assessmentId);
  if (error) throw new Error(error.message);
}

describe("which bank a child is assessed from", () => {
  it("puts a 5th grader on C and a 7th grader on D", async () => {
    const fifth = await startOlympiad("5");
    expect(fifth.started.status, fifth.started.text).toBe(200);
    expect(fifth.started.body.assessment?.category).toBe("C");

    const seventh = await startOlympiad("7");
    expect(seventh.started.body.assessment?.category).toBe("D");
  });

  it("asks a child outside 5-8 to choose instead of guessing", async () => {
    const { client, started } = await startOlympiad("11");

    expect(started.status).toBe(400);
    expect((started.body as { needsCategory?: boolean }).needsCategory).toBe(true);

    // And the choice they make is honoured.
    const chosen = await client.post<{ assessment?: { category?: string } }>("/api/assessment", {
      track: "olympiad",
      category: "D",
    });
    expect(chosen.status).toBe(200);
    expect(chosen.body.assessment?.category).toBe("D");
  });

  it("serves only that category's problems", async () => {
    const run = randomUUID().slice(0, 8);
    // Spread across the difficulty ladder so the picker has somewhere to go
    // whichever answer the walk below gives.
    for (const d of [2, 4, 6, 8]) {
      await createProblem("C", d, `C-${run}-${d}`);
      await createProblem("D", d, `D-${run}-${d}`);
      await createProblem(null, d, `none-${run}-${d}`);
    }

    const { client, started } = await startOlympiad("6");
    const assessmentId = started.body.assessment!.id;
    await reachPickingPhase(assessmentId);

    const servedIds: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await client.get<{ problem: { id: string } | null }>(
        `/api/assessment/${assessmentId}/next-problem`
      );
      expect(res.status).toBe(200);
      if (!res.body.problem) break;
      servedIds.push(res.body.problem.id);
      await client.post(`/api/assessment/${assessmentId}/problem-action`, {
        problemId: res.body.problem.id,
        action: "too_easy",
      });
    }

    expect(servedIds.length).toBeGreaterThan(0);
    // Checked against the rows themselves rather than topic strings: the bank
    // is shared with other tests, and what matters is the category of every
    // problem this child was actually shown.
    const { data } = await testDb().from("problems").select("id, category").in("id", servedIds);
    const categories = (data as { id: string; category: string | null }[]).map((p) => p.category);
    expect(categories.length).toBe(servedIds.length);
    expect(categories.every((c) => c === "C")).toBe(true);
  });

  it("keeps the category even after the child's grade is corrected", async () => {
    const run = randomUUID().slice(0, 8);
    await createProblem("C", 3, `C-${run}`);
    await createProblem("D", 3, `D-${run}`);

    const { user, client, started } = await startOlympiad("5");
    const assessmentId = started.body.assessment!.id;
    expect(started.body.assessment?.category).toBe("C");

    // The parent fixes the grade mid-assessment.
    await testDb().from("users").update({ grade: "8" }).eq("id", user.id);
    await reachPickingPhase(assessmentId);

    const res = await client.get<{ problem: { id: string } | null }>(
      `/api/assessment/${assessmentId}/next-problem`
    );
    expect(res.body.problem).not.toBeNull();
    const { data } = await testDb()
      .from("problems")
      .select("category")
      .eq("id", res.body.problem!.id)
      .single();
    expect((data as { category: string }).category).toBe("C");
  });
});

describe("entering problems by category", () => {
  it("refuses a problem with no category", async () => {
    const admin = await adminClient("full");

    const res = await admin.post<{ error: string }>("/api/admin/problems", {
      level: 3,
      difficulty: 3,
      topic: "Ангилалгүй",
      bodyLatex: "1+1=?",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Ангилал");
  });

  it("refuses a category that is not C or D", async () => {
    const admin = await adminClient("full");
    for (const category of ["A", "E", "c", 3, null]) {
      const res = await admin.post(`/api/admin/problems`, {
        category,
        level: 3,
        difficulty: 3,
        topic: "Буруу ангилал",
        bodyLatex: "1+1=?",
      });
      expect(res.status, JSON.stringify(category)).toBe(400);
    }
  });

  it("stores and returns the category", async () => {
    const admin = await adminClient("full");

    const created = await admin.post<{ problem: { id: string; category: string } }>("/api/admin/problems", {
      category: "D",
      level: 4,
      difficulty: 4.5,
      topic: "Тоон онол",
      bodyLatex: "$a^2 + b^2$",
    });
    expect(created.status, created.text).toBe(200);
    track("problems", created.body.problem.id);
    expect(created.body.problem.category).toBe("D");

    // And it can be re-filed.
    const updated = await admin.put<{ problem: { category: string } }>(
      `/api/admin/problems/${created.body.problem.id}`,
      { category: "C" }
    );
    expect(updated.status).toBe(200);
    expect(updated.body.problem.category).toBe("C");
  });
});
