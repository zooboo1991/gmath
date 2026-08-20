/**
 * Slug-addressed course pages — /courses/songon5 rather than a uuid.
 *
 * The lookup used to ask the uuid column first and fall back to the slug. It
 * worked, but "songon5" is not a uuid, so Postgres raised and logged
 * `22P02 invalid input syntax for type uuid` on every single view — twice per
 * page (metadata + render), and eight times when the course list prefetched
 * all four Сонгон pages at once. It was the single biggest source of database
 * errors in the project's logs.
 *
 * These tests pin the behaviour that made the fix safe: a slug still resolves,
 * a uuid still resolves, and a value that is neither is simply "not found"
 * rather than an error.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient } from "../../support/client";
import { cleanupTracked, testDb } from "../../support/db";
import { createTestCourse } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

async function setSlug(courseId: string, slug: string) {
  const { error } = await testDb().from("courses").update({ slug }).eq("id", courseId);
  if (error) throw new Error(`setSlug failed: ${error.message}`);
}

describe("finding a course by whatever the URL carried", () => {
  it("serves the page for a slug", async () => {
    const course = await createTestCourse({ status: "published" });
    const slug = `test-slug-${course.id.slice(0, 8)}`;
    await setSlug(course.id, slug);

    const res = await anonClient().get(`/courses/${slug}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain(course.title);
  });

  it("still serves the same page by uuid, so links already shared keep working", async () => {
    const course = await createTestCourse({ status: "published" });
    await setSlug(course.id, `test-slug-${course.id.slice(0, 8)}`);

    const res = await anonClient().get(`/courses/${course.id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain(course.title);
  });

  it("answers 404 for an address that is neither", async () => {
    for (const bad of ["songon-does-not-exist", "null", "undefined", "12345"]) {
      const res = await anonClient().get(`/courses/${bad}`);
      expect(res.status, bad).toBe(404);
    }
  });
});
