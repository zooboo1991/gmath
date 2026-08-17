/**
 * POST /api/lessons/recording and /api/lessons/join.
 *
 * These two are the paywall. Everything a student pays for — the live Zoom
 * room and the recording afterwards — is handed out by these endpoints, and
 * knowing a course id is not supposed to be enough to get either.
 *
 * The expected refusal is 404, not 403: a 403 would confirm that the course
 * (or the recording) exists, which is itself worth knowing to someone
 * probing ids.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, signedInClient } from "../../support/client";
import { cleanupTracked } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

const BUNNY_VIDEO_ID = "0f6b4f9a-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

afterAll(async () => {
  await cleanupTracked();
});

/** A course whose first lesson has both a recording and its own Zoom room. */
async function courseWithLesson() {
  return createTestCourse({
    lessons: [
      {
        topic: "Тест хичээл",
        mode: "online",
        zoomLink: "https://zoom.us/j/1234567890",
        recordingLink: `https://iframe.mediadelivery.net/embed/123456/${BUNNY_VIDEO_ID}`,
      },
    ],
  });
}

describe("POST /api/lessons/recording", () => {
  it("refuses a signed-out visitor", async () => {
    const course = await courseWithLesson();
    const res = await anonClient().post("/api/lessons/recording", {
      courseId: course.id,
      lessonIndex: 0,
    });
    expect(res.status).toBe(401);
  });

  it("gives a signed-in student with no registration a 404, not a 403", async () => {
    const course = await courseWithLesson();
    const outsider = await createTestUser();
    const client = await signedInClient(outsider.phone, outsider.password);

    const res = await client.post<{ url?: string }>("/api/lessons/recording", {
      courseId: course.id,
      lessonIndex: 0,
    });

    // 403 would confirm the course exists; 404 says nothing either way.
    expect(res.status).toBe(404);
    expect(res.body.url).toBeUndefined();
    expect(res.text).not.toContain(BUNNY_VIDEO_ID);
  });

  it("refuses a student whose registration is still pending payment", async () => {
    const course = await courseWithLesson();
    const student = await createTestUser();
    await createTestRegistration({
      userId: student.id,
      programId: course.id,
      status: "pending",
    });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post("/api/lessons/recording", {
      courseId: course.id,
      lessonIndex: 0,
    });

    // Registering without paying must not unlock the recordings.
    expect(res.status).toBe(404);
    expect(res.text).not.toContain(BUNNY_VIDEO_ID);
  });

  it("refuses a student who paid for a different course", async () => {
    const paidCourse = await courseWithLesson();
    const otherCourse = await courseWithLesson();
    const student = await createTestUser();
    await createTestRegistration({
      userId: student.id,
      programId: paidCourse.id,
      status: "active",
    });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post("/api/lessons/recording", {
      courseId: otherCourse.id,
      lessonIndex: 0,
    });
    expect(res.status).toBe(404);
  });

  it("hands an actively registered student a signed, expiring URL", async () => {
    const course = await courseWithLesson();
    const student = await createTestUser();
    await createTestRegistration({
      userId: student.id,
      programId: course.id,
      status: "active",
    });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post<{ ok: boolean; external: boolean; url: string }>(
      "/api/lessons/recording",
      { courseId: course.id, lessonIndex: 0 }
    );

    expect(res.status).toBe(200);
    expect(res.body.external).toBe(false);

    const url = new URL(res.body.url);
    expect(url.searchParams.get("token")).toMatch(/^[0-9a-f]{64}$/);
    const expires = Number(url.searchParams.get("expires"));
    // Seconds, not milliseconds, and a few hours out rather than forever —
    // a link copied out of devtools has to die the same day.
    const secondsFromNow = expires - Math.floor(Date.now() / 1000);
    expect(secondsFromNow).toBeGreaterThan(0);
    expect(secondsFromNow).toBeLessThanOrEqual(3 * 60 * 60);
  });

  it("says so plainly for a lesson with no recording yet", async () => {
    const course = await createTestCourse({ lessons: [{ topic: "Бичлэггүй хичээл" }] });
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "active" });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post("/api/lessons/recording", {
      courseId: course.id,
      lessonIndex: 0,
    });
    expect(res.status).toBe(404);
  });

  it("does not sign a Drive or YouTube recording, it just returns the link", async () => {
    const course = await createTestCourse({
      lessons: [{ topic: "Хуучин бичлэг", recordingLink: "https://drive.google.com/file/d/abc/view" }],
    });
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "active" });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post<{ external: boolean; url: string }>("/api/lessons/recording", {
      courseId: course.id,
      lessonIndex: 0,
    });
    expect(res.status).toBe(200);
    expect(res.body.external).toBe(true);
    expect(res.body.url).toBe("https://drive.google.com/file/d/abc/view");
  });

  it("refuses a lesson index that is out of range", async () => {
    const course = await courseWithLesson();
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "active" });
    const client = await signedInClient(student.phone, student.password);

    for (const lessonIndex of [1, 99, -1]) {
      const res = await client.post("/api/lessons/recording", { courseId: course.id, lessonIndex });
      expect(res.status, `lessonIndex ${lessonIndex}`).toBe(404);
    }
  });

  it("refuses a course id that does not exist", async () => {
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post("/api/lessons/recording", {
      courseId: randomUUID(),
      lessonIndex: 0,
    });
    expect(res.status).toBe(404);
  });

  describe("malformed input", () => {
    const cases: [string, unknown][] = [
      ["no body fields", {}],
      ["missing lessonIndex", { courseId: randomUUID() }],
      ["lessonIndex as a string", { courseId: randomUUID(), lessonIndex: "0" }],
      ["courseId as a number", { courseId: 1, lessonIndex: 0 }],
      ["null courseId", { courseId: null, lessonIndex: 0 }],
    ];

    for (const [name, body] of cases) {
      it(`answers 400 for ${name}`, async () => {
        const student = await createTestUser();
        const client = await signedInClient(student.phone, student.password);
        const res = await client.post("/api/lessons/recording", body);
        expect(res.status).toBe(400);
      });
    }

    it("checks the session before the request body", async () => {
      // A signed-out visitor gets 401 even when the body is nonsense, so a
      // malformed request can never reveal more than a well-formed one.
      const res = await anonClient().post("/api/lessons/recording", {});
      expect(res.status).toBe(401);
    });
  });
});

describe("POST /api/lessons/join", () => {
  it("refuses a signed-out visitor", async () => {
    const course = await courseWithLesson();
    const res = await anonClient().post("/api/lessons/join", {
      courseId: course.id,
      lessonIndex: 0,
    });
    expect(res.status).toBe(401);
  });

  it("does not give another student's Zoom link to an outsider", async () => {
    const course = await courseWithLesson();
    const outsider = await createTestUser();
    const client = await signedInClient(outsider.phone, outsider.password);

    const res = await client.post<{ joinUrl?: string }>("/api/lessons/join", {
      courseId: course.id,
      lessonIndex: 0,
    });

    expect(res.status).toBe(404);
    expect(res.body.joinUrl).toBeUndefined();
    expect(res.text).not.toContain("zoom.us");
  });

  it("refuses a student who has not paid", async () => {
    const course = await courseWithLesson();
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "pending" });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post("/api/lessons/join", { courseId: course.id, lessonIndex: 0 });
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("zoom.us");
  });

  it("gives an actively registered student the lesson's room", async () => {
    const course = await courseWithLesson();
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "active" });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post<{ ok: boolean; joinUrl: string }>("/api/lessons/join", {
      courseId: course.id,
      lessonIndex: 0,
    });
    expect(res.status).toBe(200);
    expect(res.body.joinUrl).toBe("https://zoom.us/j/1234567890");
  });

  it("refuses a lesson with no room at all", async () => {
    const course = await createTestCourse({ lessons: [{ topic: "Танхимын хичээл" }] });
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "active" });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post("/api/lessons/join", { courseId: course.id, lessonIndex: 0 });
    expect(res.status).toBe(404);
  });

  it("refuses an out-of-range lesson index", async () => {
    const course = await courseWithLesson();
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "active" });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post("/api/lessons/join", { courseId: course.id, lessonIndex: 7 });
    expect(res.status).toBe(404);
  });
});
