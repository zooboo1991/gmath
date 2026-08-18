/**
 * Lesson notes — the PDF of what was worked through in a lesson.
 *
 *   POST   /api/admin/lesson-note  → a signed URL to upload to
 *   GET    /api/admin/lesson-note  → the teacher's own look at it
 *   DELETE /api/admin/lesson-note  → remove the object
 *   POST   /api/lessons/note       → a student's signed, expiring read
 *
 * The file never passes through the app: the browser PUTs it straight to
 * Supabase Storage, because a serverless request body is capped at 4.5 MB and
 * these files are bigger. That shifts the interesting questions to this
 * boundary — who can obtain an upload URL, what a lesson row is allowed to
 * claim as its notes, and whether a student who is not registered can read
 * them. Those are what this file pins down.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb, trackStorageObject } from "../../support/db";
import {
  createTestCourse,
  createTestRegistration,
  createTestUser,
  makePhone,
} from "../../support/factories";

beforeAll(async () => {
  // The test server is `next dev`: the first request to a route compiles it,
  // which on a cold .next-test took longer than a test's own 30s timeout and
  // failed four of these for reasons that had nothing to do with them. Warm
  // both routes first, so a timeout below means a slow request rather than a
  // slow compiler. The responses are deliberately ignored — an unauthenticated
  // call is enough to build the module.
  await anonClient().post("/api/admin/lesson-note", { size: 1 });
  await anonClient().post("/api/lessons/note", {});
}, 240_000);

afterAll(async () => {
  await cleanupTracked();
});

const PDF_BYTES = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

/** Goes through the real flow: ask for an upload URL, then PUT the bytes. */
async function uploadNote(): Promise<string> {
  const admin = await adminClient("full");
  const res = await admin.post<{ path: string; signedUrl: string }>("/api/admin/lesson-note", {
    size: PDF_BYTES.length,
  });
  expect(res.status, res.text).toBe(200);
  const { path, signedUrl } = res.body;
  trackStorageObject("lesson-notes", path);

  const put = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: PDF_BYTES,
  });
  expect(put.status, await put.text()).toBeLessThan(300);
  return path;
}

/** A course with one lesson whose notes are `path`, and a student on it. */
async function courseWithNote(path: string, options: { active?: boolean } = {}) {
  const course = await createTestCourse({
    lessons: [{ topic: "Логик бодлогууд", mode: "online", noteFile: path, noteSize: PDF_BYTES.length }],
  });
  const user = await createTestUser();
  await createTestRegistration({
    userId: user.id,
    programId: course.id,
    status: options.active === false ? "pending" : "active",
  });
  return { course, user };
}

describe("getting somewhere to upload", () => {
  it("refuses a signed-out visitor and the read-only admin", async () => {
    expect((await anonClient().post("/api/admin/lesson-note", { size: 1000 })).status).toBe(401);
    const viewer = await adminClient("viewer");
    expect((await viewer.post("/api/admin/lesson-note", { size: 1000 })).status).toBe(401);
  });

  it("refuses a file past the 50MB cap", async () => {
    const admin = await adminClient("full");
    const res = await admin.post("/api/admin/lesson-note", { size: 60 * 1024 * 1024 });
    expect(res.status).toBe(400);
  });

  it("refuses a request with no size at all", async () => {
    const admin = await adminClient("full");
    for (const body of [{}, { size: 0 }, { size: -1 }, { size: "big" }]) {
      expect((await admin.post("/api/admin/lesson-note", body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("hands back a path this app chose, not one the caller named", async () => {
    const admin = await adminClient("full");
    const res = await admin.post<{ path: string }>("/api/admin/lesson-note", {
      size: 1000,
      path: "notes/../solutions/someone-elses-work.jpg",
    });
    expect(res.status).toBe(200);
    expect(res.body.path).toMatch(/^notes\/[0-9a-f-]{36}\.pdf$/);
  });
});

describe("a student reading the notes", () => {
  it("gives a registered student a working link", async () => {
    const path = await uploadNote();
    const { course, user } = await courseWithNote(path);
    const client = await signedInClient(user.phone, user.password);

    const res = await client.post<{ url: string }>("/api/lessons/note", {
      courseId: course.id,
      lessonIndex: 0,
    });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("/lesson-notes/");
    // The link has to actually serve the file — a signed URL for a missing
    // object still looks like a URL.
    const fetched = await fetch(res.body.url);
    expect(fetched.status).toBe(200);
    expect(await fetched.text()).toContain("%PDF-");
  });

  it("refuses a signed-out visitor", async () => {
    const path = await uploadNote();
    const { course } = await courseWithNote(path);
    expect(
      (await anonClient().post("/api/lessons/note", { courseId: course.id, lessonIndex: 0 })).status
    ).toBe(401);
  });

  it("hides them from a student whose registration is still pending", async () => {
    const path = await uploadNote();
    const { course, user } = await courseWithNote(path, { active: false });
    const client = await signedInClient(user.phone, user.password);

    const res = await client.post("/api/lessons/note", { courseId: course.id, lessonIndex: 0 });

    // 404, not 403: whether this lesson has notes is not something to leak.
    expect(res.status).toBe(404);
  });

  it("hides them from a student registered on a different course", async () => {
    const path = await uploadNote();
    const { course } = await courseWithNote(path);
    const outsider = await createTestUser();
    const otherCourse = await createTestCourse();
    await createTestRegistration({ userId: outsider.id, programId: otherCourse.id, status: "active" });
    const client = await signedInClient(outsider.phone, outsider.password);

    expect((await client.post("/api/lessons/note", { courseId: course.id, lessonIndex: 0 })).status).toBe(404);
  });

  it("says so plainly when the lesson has no notes", async () => {
    const course = await createTestCourse({ lessons: [{ topic: "Тэмдэглэлгүй", mode: "online" }] });
    const user = await createTestUser();
    await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });
    const client = await signedInClient(user.phone, user.password);

    expect((await client.post("/api/lessons/note", { courseId: course.id, lessonIndex: 0 })).status).toBe(404);
  });
});

describe("what a lesson may claim as its notes", () => {
  /**
   * The path is saved by the ordinary course PUT, which means a hand-written
   * request could name any object in the bucket — or one in another bucket
   * entirely. normalizeLessons keeps only paths of the shape this app mints.
   */
  it("drops a path that was not minted by the upload endpoint", async () => {
    const course = await createTestCourse();
    const admin = await adminClient("full");

    const res = await admin.put(`/api/admin/courses/${course.id}`, {
      kind: "upcoming",
      status: "published",
      tag: "C ангилал",
      title: "Тестийн сургалт",
      topics: "сэдэв",
      price: "100,000₮",
      period: "4 долоо хоног",
      lessons: [
        { topic: "Хичээл 1", mode: "online", noteFile: "../solutions/private.jpg", noteSize: 100 },
        { topic: "Хичээл 2", mode: "online", noteFile: "notes/not-a-uuid.pdf", noteSize: 100 },
      ],
    });
    expect(res.status, res.text).toBe(200);

    const { data } = await testDb().from("courses").select("lessons").eq("id", course.id).single();
    const lessons = (data as { lessons: { noteFile?: string; noteSize?: number }[] }).lessons;
    expect(lessons[0].noteFile).toBeUndefined();
    expect(lessons[0].noteSize).toBeUndefined();
    expect(lessons[1].noteFile).toBeUndefined();
  });

  it("keeps a real one through a save", async () => {
    const path = await uploadNote();
    const course = await createTestCourse();
    const admin = await adminClient("full");

    const res = await admin.put(`/api/admin/courses/${course.id}`, {
      kind: "upcoming",
      status: "published",
      tag: "C ангилал",
      title: "Тестийн сургалт",
      topics: "сэдэв",
      price: "100,000₮",
      period: "4 долоо хоног",
      lessons: [{ topic: "Хичээл 1", mode: "online", noteFile: path, noteSize: 12345 }],
    });
    expect(res.status, res.text).toBe(200);

    const { data } = await testDb().from("courses").select("lessons").eq("id", course.id).single();
    const lesson = (data as { lessons: { noteFile?: string; noteSize?: number }[] }).lessons[0];
    expect(lesson.noteFile).toBe(path);
    expect(lesson.noteSize).toBe(12345);
  });
});

describe("the teacher's own view and delete", () => {
  it("opens the file for a full admin and refuses everyone else", async () => {
    const path = await uploadNote();
    const admin = await adminClient("full");

    const res = await admin.get<{ url: string }>(`/api/admin/lesson-note?path=${encodeURIComponent(path)}`);
    expect(res.status).toBe(200);
    expect((await fetch(res.body.url)).status).toBe(200);

    const viewer = await adminClient("viewer");
    expect((await viewer.get(`/api/admin/lesson-note?path=${encodeURIComponent(path)}`)).status).toBe(401);
    expect((await anonClient().get(`/api/admin/lesson-note?path=${encodeURIComponent(path)}`)).status).toBe(401);
  });

  it("refuses to sign or delete a path outside the notes prefix", async () => {
    const admin = await adminClient("full");
    for (const path of ["solutions/x.jpg", "notes/../x.pdf", "notes/x.pdf", ""]) {
      expect((await admin.get(`/api/admin/lesson-note?path=${encodeURIComponent(path)}`)).status, path).toBe(400);
      expect((await admin.del("/api/admin/lesson-note", { path })).status, path).toBe(400);
    }
  });

  it("deletes the object, so a replaced set of notes does not linger", async () => {
    const path = await uploadNote();
    const admin = await adminClient("full");

    expect((await admin.del("/api/admin/lesson-note", { path })).status).toBe(200);

    const { data } = await testDb().storage.from("lesson-notes").list("notes");
    expect((data ?? []).some((o) => `notes/${o.name}` === path)).toBe(false);
  });
});

describe("who may hold an upload URL", () => {
  it("is not something a student can ask for", async () => {
    const user = await createTestUser({ phone: makePhone() });
    const client = await signedInClient(user.phone, user.password);
    expect((await client.post("/api/admin/lesson-note", { size: 1000 })).status).toBe(401);
  });
});
