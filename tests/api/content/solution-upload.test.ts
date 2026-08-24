/**
 * POST /api/assessment/[id]/solutions — the child's photo of their working.
 *
 * Written against a report that uploads were not landing. The whole path is
 * here: a real JPEG's bytes, through the real endpoint, into the private
 * bucket, and back out as a signed URL that actually serves the file.
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

/** An invited child, paid, with the exam's paper in front of them. */
async function readyToSolve(): Promise<{ client: TestClient; assessmentId: string; problemId: string }> {
  const admin = await adminClient("full");
  const course = await createTestCourse();
  const user = await createTestUser({ grade: "6-р анги" });
  await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });

  const { data: problem } = await testDb()
    .from("problems")
    .insert({ category: "C", topic: "Бодолт оруулах тест", body_latex: "1+1", active: true })
    .select("id")
    .single();
  const problemId = (problem as { id: string }).id;
  track("problems", problemId);

  const created = await admin.post<{ exam: { id: string } }>("/api/admin/exams", {
    title: "Бодолтын тест",
    category: "C",
    fee: "0₮",
  });
  const examId = created.body.exam.id;
  track("exams", examId);
  await admin.put(`/api/admin/exams/${examId}`, {
    problemIds: [problemId],
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

  return { client, assessmentId, problemId };
}

describe("uploading a photo of the working", () => {
  it("stores it and hands back a link that serves the file", async () => {
    const { client, assessmentId, problemId } = await readyToSolve();

    const body = new FormData();
    body.append("problemId", problemId);
    body.append("files", new Blob([JPEG], { type: "image/jpeg" }), "bodolt.jpg");

    const res = await client.postForm<{ imageUrls: string[] }>(
      `/api/assessment/${assessmentId}/solutions`,
      body
    );

    expect(res.status, res.text).toBe(200);
    expect(res.body.imageUrls).toHaveLength(1);

    const { data } = await testDb()
      .from("solutions")
      .select("image_paths")
      .eq("assessment_id", assessmentId)
      .single();
    for (const path of (data as { image_paths: string[] }).image_paths) {
      trackStorageObject("solutions", path);
    }

    const fetched = await fetch(res.body.imageUrls[0]);
    expect(fetched.status).toBe(200);
    expect((await fetched.arrayBuffer()).byteLength).toBe(JPEG.byteLength);
  });

  it("adds a second photo to the same problem rather than replacing the first", async () => {
    const { client, assessmentId, problemId } = await readyToSolve();

    for (const name of ["1.jpg", "2.jpg"]) {
      const body = new FormData();
      body.append("problemId", problemId);
      body.append("files", new Blob([JPEG], { type: "image/jpeg" }), name);
      const res = await client.postForm(`/api/assessment/${assessmentId}/solutions`, body);
      expect(res.status, res.text).toBe(200);
    }

    const { data } = await testDb()
      .from("solutions")
      .select("image_paths")
      .eq("assessment_id", assessmentId)
      .single();
    const paths = (data as { image_paths: string[] }).image_paths;
    for (const path of paths) trackStorageObject("solutions", path);
    expect(paths).toHaveLength(2);
  });

  it("refuses a file that is not an image the site can serve", async () => {
    const { client, assessmentId, problemId } = await readyToSolve();

    const body = new FormData();
    body.append("problemId", problemId);
    // An iPhone's default photo format. The browser converts it when it can;
    // when it cannot, these bytes arrive and the answer has to be readable.
    body.append("files", new Blob([Buffer.from("ftypheic-not-really")], { type: "image/heic" }), "IMG.HEIC");

    const res = await client.postForm<{ error: string }>(
      `/api/assessment/${assessmentId}/solutions`,
      body
    );

    expect(res.status).toBe(400);
    // The answer has to tell a parent what to change on the phone, not just
    // list formats.
    expect(res.body.error).toContain("Хамгийн нийцтэй");
  });
});
