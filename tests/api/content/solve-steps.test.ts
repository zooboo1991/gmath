/**
 * The step-by-step paper: one problem per step, saved as the child goes.
 *
 * What the browser needs from the server is (1) every problem on the paper in
 * order with what has been done to it, so a child who closes the tab resumes
 * where they stopped, and (2) a way to record "бодож чадсангүй" so a paper of
 * ten can be handed in with nine photos.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track, trackStorageObject } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

/** A 1x1 JPEG — the smallest thing with real JPEG magic bytes. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

type Step = { problem: { id: string } | null; imageUrls: string[]; skipped: boolean };

/** An invited child, paid, with a two-problem paper in front of them. */
async function readyToSolve(): Promise<{
  client: TestClient;
  assessmentId: string;
  problemIds: string[];
}> {
  const admin = await adminClient("full");
  const course = await createTestCourse();
  const user = await createTestUser({ grade: "6-р анги" });
  await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });

  const problemIds: string[] = [];
  for (const body of ["1+1", "2+2"]) {
    const { data } = await testDb()
      .from("problems")
      .insert({ category: "C", topic: "Алхмын тест", body_latex: body, active: true })
      .select("id")
      .single();
    const problemId = (data as { id: string }).id;
    track("problems", problemId);
    problemIds.push(problemId);
  }

  const created = await admin.post<{ exam: { id: string } }>("/api/admin/exams", {
    title: "Алхмын шалгалт",
    category: "C",
    fee: "0₮",
  });
  const examId = created.body.exam.id;
  track("exams", examId);
  await admin.put(`/api/admin/exams/${examId}`, {
    problemIds,
    freeCourseIds: [course.id],
    status: "open",
  });

  const client = await signedInClient(user.phone, user.password);
  const started = await client.post<{ assessment: { id: string } }>("/api/assessment", {
    track: "olympiad",
    examId,
  });
  const assessmentId = started.body.assessment.id;
  await client.post(`/api/assessment/${assessmentId}/pay`);

  return { client, assessmentId, problemIds };
}

/** Uploads one photo of working against a problem. */
async function uploadPhoto(client: TestClient, assessmentId: string, problemId: string) {
  const body = new FormData();
  body.append("problemId", problemId);
  body.append("files", new Blob([JPEG], { type: "image/jpeg" }), "bodolt.jpg");
  const res = await client.postForm(`/api/assessment/${assessmentId}/solutions`, body);
  const { data } = await testDb()
    .from("solutions")
    .select("image_paths")
    .eq("assessment_id", assessmentId)
    .eq("problem_id", problemId)
    .maybeSingle();
  for (const path of (data as { image_paths: string[] } | null)?.image_paths ?? []) {
    trackStorageObject("solutions", path);
  }
  return res;
}

describe("the paper, step by step", () => {
  it("hands back every problem so the child can be put back where they stopped", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    const before = await client.get<{ steps: Step[] }>(`/api/assessment/${assessmentId}/solutions`);
    expect(before.status, before.text).toBe(200);
    expect(before.body.steps).toHaveLength(2);
    expect(before.body.steps.every((s) => s.imageUrls.length === 0 && !s.skipped)).toBe(true);

    await uploadPhoto(client, assessmentId, problemIds[0]);

    const after = await client.get<{ steps: Step[] }>(`/api/assessment/${assessmentId}/solutions`);
    const done = after.body.steps.filter((s) => s.imageUrls.length > 0 || s.skipped);
    expect(done).toHaveLength(1);
    expect(done[0].problem?.id).toBe(problemIds[0]);
  });

  it("lets a problem be given up on, and hands the paper in one photo short", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    await uploadPhoto(client, assessmentId, problemIds[0]);
    const skipped = await client.post(`/api/assessment/${assessmentId}/skip`, {
      problemId: problemIds[1],
    });
    expect(skipped.status, skipped.text).toBe(200);

    const steps = await client.get<{ steps: Step[] }>(`/api/assessment/${assessmentId}/solutions`);
    expect(steps.body.steps.find((s) => s.problem?.id === problemIds[1])?.skipped).toBe(true);

    const submitted = await client.post(`/api/assessment/${assessmentId}/submit`);
    expect(submitted.status, submitted.text).toBe(200);
  });

  it("takes the photo when a child comes back to a problem they gave up on", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    await client.post(`/api/assessment/${assessmentId}/skip`, { problemId: problemIds[0] });
    const res = await uploadPhoto(client, assessmentId, problemIds[0]);
    expect(res.status, res.text).toBe(200);

    const steps = await client.get<{ steps: Step[] }>(`/api/assessment/${assessmentId}/solutions`);
    const step = steps.body.steps.find((s) => s.problem?.id === problemIds[0]);
    expect(step?.skipped).toBe(false);
    expect(step?.imageUrls).toHaveLength(1);
  });

  it("refuses to mark a photographed problem as unsolved", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    await uploadPhoto(client, assessmentId, problemIds[0]);
    const res = await client.post(`/api/assessment/${assessmentId}/skip`, {
      problemId: problemIds[0],
    });
    expect(res.status).toBe(409);
  });

  it("refuses a problem that is not on this child's paper", async () => {
    const { client, assessmentId } = await readyToSolve();
    const other = await readyToSolve();

    const res = await client.post(`/api/assessment/${assessmentId}/skip`, {
      problemId: other.problemIds[0],
    });
    expect(res.status).toBe(400);
  });
});
