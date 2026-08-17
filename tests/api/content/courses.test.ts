/**
 * Courses — /api/admin/courses and /api/admin/courses/[id].
 *
 * Beyond ordinary validation, two things here have consequences beyond a bad
 * form save: an admin-supplied link becomes an `href` on a page students
 * click (so a `javascript:` URL must never be stored), and a course save
 * carries the linked-article list, which used to fail outright — losing the
 * teacher's other edits — when one of those articles had been deleted
 * meanwhile.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { trackNotificationsMentioning } from "../../support/factories";
import { MAX_LEN } from "@/lib/validate";

/** Article titles created here — each one broadcast a "шинэ нийтлэл" notification. */
const createdTitles: string[] = [];

afterAll(async () => {
  for (const title of createdTitles) await trackNotificationsMentioning(title);
  await cleanupTracked();
});

type CourseResponse = {
  ok: boolean;
  error?: string;
  course?: { id: string; title: string; status: string; capacity?: number };
};

function courseBody(overrides: Record<string, unknown> = {}) {
  return {
    kind: "upcoming",
    tag: "C ангилал",
    title: `Тест сургалт ${randomUUID().slice(0, 8)}`,
    topics: "Сэдвүүд",
    price: "150,000₮",
    period: "4 долоо хоног",
    ...overrides,
  };
}

async function createCourse(admin: TestClient, overrides: Record<string, unknown> = {}) {
  const res = await admin.post<CourseResponse>("/api/admin/courses", courseBody(overrides));
  if (res.body?.course?.id) track("courses", res.body.course.id);
  return res;
}

async function createArticle(admin: TestClient) {
  const res = await admin.post<{ article: { id: string; title: string } }>("/api/admin/articles", {
    title: `Холбоос нийтлэл ${randomUUID().slice(0, 8)}`,
    excerpt: "Товч",
    content: "<p>Эх бие</p>",
    coverImage: "https://example.test/cover.png",
    author: "Б.Ганбат",
  });
  track("articles", res.body.article.id);
  createdTitles.push(res.body.article.title);
  return res.body.article;
}

async function linkedArticleIds(courseId: string): Promise<string[]> {
  const { data, error } = await testDb()
    .from("course_articles")
    .select("article_id, position")
    .eq("program_id", courseId)
    .order("position");
  if (error) throw error;
  return (data as { article_id: string }[]).map((r) => r.article_id);
}

describe("creating a course", () => {
  it("creates it as a draft unless told otherwise", async () => {
    const admin = await adminClient("full");
    const res = await createCourse(admin);

    expect(res.status).toBe(200);
    // Nothing reaches the public site by accident: publishing is a separate,
    // deliberate action.
    expect(res.body.course?.status).toBe("draft");
  });

  it("keeps a draft off the public course list", async () => {
    const admin = await adminClient("full");
    const created = await createCourse(admin);
    const title = created.body.course!.title;

    const page = await anonClient().get("/courses");
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(title);
  });

  it("shows it publicly once published", async () => {
    const admin = await adminClient("full");
    const created = await createCourse(admin, { status: "published" });

    const page = await anonClient().get("/courses");
    expect(page.text).toContain(created.body.course!.title);
  });

  describe("required fields", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["no kind", { kind: undefined }],
      ["unknown kind", { kind: "webinar" }],
      ["kind as a number", { kind: 1 }],
      ["no tag", { tag: "" }],
      ["whitespace tag", { tag: "   " }],
      ["no title", { title: "" }],
      ["no price", { price: "" }],
      ["no period", { period: "" }],
    ];

    for (const [name, overrides] of cases) {
      it(`refuses ${name}`, async () => {
        const admin = await adminClient("full");
        const res = await createCourse(admin, overrides);
        expect(res.status).toBe(400);
      });
    }
  });

  describe("length limits", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["tag", { tag: "т".repeat(MAX_LEN.courseTag + 1) }],
      ["title", { title: "т".repeat(MAX_LEN.courseTitle + 1) }],
      ["topics", { topics: "т".repeat(MAX_LEN.courseTopics + 1) }],
      ["price", { price: "1".repeat(MAX_LEN.coursePrice + 1) }],
      ["period", { period: "т".repeat(MAX_LEN.coursePeriod + 1) }],
      ["startDate", { startDate: "т".repeat(MAX_LEN.courseDate + 1) }],
      ["mode", { mode: "т".repeat(MAX_LEN.courseMode + 1) }],
    ];

    for (const [field, overrides] of cases) {
      it(`refuses an over-long ${field}`, async () => {
        const admin = await adminClient("full");
        const res = await createCourse(admin, overrides);
        expect(res.status).toBe(400);
      });
    }
  });

  describe("links an admin supplies become hrefs students click", () => {
    const dangerous = [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "not-a-url-at-all",
    ];

    for (const link of dangerous) {
      it(`refuses ${link.slice(0, 24)} as a Facebook group link`, async () => {
        const admin = await adminClient("full");
        const res = await createCourse(admin, { facebookGroup: link });
        expect(res.status).toBe(400);
      });

      it(`refuses ${link.slice(0, 24)} as a Zoom link`, async () => {
        const admin = await adminClient("full");
        const res = await createCourse(admin, { zoomLink: link });
        expect(res.status).toBe(400);
      });
    }

    it("accepts an ordinary https link", async () => {
      const admin = await adminClient("full");
      const res = await createCourse(admin, {
        facebookGroup: "https://facebook.com/groups/example",
        zoomLink: "https://zoom.us/j/123",
      });
      expect(res.status).toBe(200);
    });
  });
});

describe("updating a course", () => {
  it("refuses an id that does not exist", async () => {
    const admin = await adminClient("full");
    const res = await admin.put(`/api/admin/courses/${randomUUID()}`, { title: "Шинэ нэр" });
    expect(res.status).toBe(404);
  });

  it("refuses to blank a required field", async () => {
    const admin = await adminClient("full");
    const created = await createCourse(admin);
    const id = created.body.course!.id;

    for (const patch of [{ tag: "" }, { title: "  " }, { price: "" }, { period: "" }]) {
      const res = await admin.put(`/api/admin/courses/${id}`, patch);
      expect(res.status, JSON.stringify(patch)).toBe(400);
    }
  });

  it("refuses a status it does not recognise", async () => {
    const admin = await adminClient("full");
    const created = await createCourse(admin);

    const res = await admin.put(`/api/admin/courses/${created.body.course!.id}`, {
      status: "deleted",
    });
    expect(res.status).toBe(400);
  });

  describe("capacity", () => {
    const cases: [unknown, number | null][] = [
      [18, 18],
      ["18", 18],
      [18.7, 18],
      ["", null],
      ["abc", null],
      [0, null],
      [-5, null],
      [null, null],
    ];

    for (const [input, expected] of cases) {
      it(`stores ${JSON.stringify(input)} as ${expected}`, async () => {
        const admin = await adminClient("full");
        const created = await createCourse(admin);

        const res = await admin.put<CourseResponse>(`/api/admin/courses/${created.body.course!.id}`, {
          capacity: input,
        });
        expect(res.status).toBe(200);
        // A NaN capacity would silently cap a class at nothing.
        expect(res.body.course?.capacity ?? null).toBe(expected);
      });
    }
  });
});

describe("linked articles", () => {
  /**
   * The admin panel keeps articleIds inside the course form and PUTs the
   * whole thing, so a real save always carries other fields too — see
   * CourseObjectPage.tsx. These tests send the same shape.
   */
  function saveArticles(admin: TestClient, courseId: string, articleIds: unknown[], title = "Хадгалсан нэр") {
    return admin.put<CourseResponse>(`/api/admin/courses/${courseId}`, { title, articleIds });
  }

  it("saves the list in the order it was given", async () => {
    const admin = await adminClient("full");
    const course = await createCourse(admin);
    const first = await createArticle(admin);
    const second = await createArticle(admin);

    const res = await saveArticles(admin, course.body.course!.id, [second.id, first.id]);
    expect(res.status).toBe(200);
    expect(await linkedArticleIds(course.body.course!.id)).toEqual([second.id, first.id]);
  });

  /**
   * A save carrying only article links changes no course column, so the
   * patch is empty — which used to read as "no such course" and answer 404
   * before the links were written. See BUGS.md #5.
   */
  it("saves a list sent on its own, without other course fields", async () => {
    const admin = await adminClient("full");
    const course = await createCourse(admin);
    const article = await createArticle(admin);
    const courseId = course.body.course!.id;

    const res = await admin.put(`/api/admin/courses/${courseId}`, { articleIds: [article.id] });
    expect(res.status).toBe(200);
    expect(await linkedArticleIds(courseId)).toEqual([article.id]);
  });

  /**
   * The other side of that fix: an empty patch must not turn every unknown id
   * into a 200. A course that does not exist is still missing.
   */
  it("still reports a missing course as missing", async () => {
    const admin = await adminClient("full");
    const res = await admin.put("/api/admin/courses/00000000-0000-4000-8000-000000000000", {
      articleIds: [],
    });
    expect(res.status).toBe(404);
  });

  it("leaves the list alone when the field is not sent", async () => {
    const admin = await adminClient("full");
    const course = await createCourse(admin);
    const article = await createArticle(admin);
    const courseId = course.body.course!.id;

    await saveArticles(admin, courseId, [article.id]);
    // A save from a form with no article picker in it.
    await admin.put(`/api/admin/courses/${courseId}`, { title: "Өөр нэр" });

    expect(await linkedArticleIds(courseId)).toEqual([article.id]);
  });

  it("does not break the save when one of the articles has been deleted", async () => {
    const admin = await adminClient("full");
    const course = await createCourse(admin);
    const courseId = course.body.course!.id;
    const kept = await createArticle(admin);
    const doomed = await createArticle(admin);

    await saveArticles(admin, courseId, [kept.id, doomed.id]);
    expect((await admin.del(`/api/admin/articles/${doomed.id}`)).status).toBe(200);

    // The teacher's open tab still has the deleted article in its list, and
    // saves the course with an unrelated edit.
    const res = await admin.put<CourseResponse>(`/api/admin/courses/${courseId}`, {
      title: "Засварласан нэр",
      articleIds: [kept.id, doomed.id],
    });

    // The foreign key would reject the whole insert; the save must survive it
    // and keep the edit, not 500 and lose the teacher's work.
    expect(res.status).toBe(200);
    expect(res.body.course?.title).toBe("Засварласан нэр");
    expect(await linkedArticleIds(courseId)).toEqual([kept.id]);
  });

  it("survives a list of ids that never existed", async () => {
    const admin = await adminClient("full");
    const course = await createCourse(admin);

    const res = await saveArticles(admin, course.body.course!.id, [randomUUID(), randomUUID()]);
    expect(res.status).toBe(200);
    expect(await linkedArticleIds(course.body.course!.id)).toEqual([]);
  });

  it("ignores non-string entries in the list", async () => {
    const admin = await adminClient("full");
    const course = await createCourse(admin);
    const article = await createArticle(admin);

    const res = await saveArticles(admin, course.body.course!.id, [article.id, 42, null, { id: "x" }]);
    expect(res.status).toBe(200);
    expect(await linkedArticleIds(course.body.course!.id)).toEqual([article.id]);
  });

  it("clears the list when an empty array is sent", async () => {
    const admin = await adminClient("full");
    const course = await createCourse(admin);
    const article = await createArticle(admin);
    const courseId = course.body.course!.id;

    await saveArticles(admin, courseId, [article.id]);
    await saveArticles(admin, courseId, []);

    expect(await linkedArticleIds(courseId)).toEqual([]);
  });

  it("does not show a scheduled article on the public course page", async () => {
    const admin = await adminClient("full");
    const course = await createCourse(admin, { status: "published" });
    const courseId = course.body.course!.id;

    const scheduled = await admin.post<{ article: { id: string; title: string } }>(
      "/api/admin/articles",
      {
        title: `Товлосон нийтлэл ${randomUUID().slice(0, 8)}`,
        excerpt: "Товч",
        content: "<p>Эх бие</p>",
        coverImage: "https://example.test/cover.png",
        author: "Б.Ганбат",
        publishAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }
    );
    track("articles", scheduled.body.article.id);
    createdTitles.push(scheduled.body.article.title);

    await saveArticles(admin, courseId, [scheduled.body.article.id], course.body.course!.title);

    // Pinning next week's post to a course must not publish it early.
    const page = await anonClient().get(`/courses/${courseId}`);
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(scheduled.body.article.title);
  });
});

describe("courses cannot be deleted through the API", () => {
  it("has no DELETE handler, because deleting a course cascades its registrations", async () => {
    const admin = await adminClient("full");
    const created = await createCourse(admin);

    const res = await admin.del(`/api/admin/courses/${created.body.course!.id}`);
    expect(res.status).toBe(405);

    // Still there.
    const listed = await admin.get<{ courses: { id: string }[] }>("/api/admin/courses");
    expect(listed.body.courses.map((c) => c.id)).toContain(created.body.course!.id);
  });
});
