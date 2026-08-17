/**
 * Articles — /api/admin/articles, /api/admin/articles/[id], and the public
 * /articles pages.
 *
 * The scheduling half is the one with teeth: an article written today for
 * next Monday must be invisible until then, and "invisible" has to mean
 * every public read path, not just the one the admin happens to check.
 * The rest is ordinary CRUD validation, plus the sanitizer that stands
 * between pasted HTML and every visitor's browser.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { trackNotificationsMentioning } from "../../support/factories";
import { MAX_LEN } from "@/lib/validate";

/** Titles created here, so the broadcast each one fired can be cleaned up too. */
const createdTitles: string[] = [];

afterAll(async () => {
  for (const title of createdTitles) await trackNotificationsMentioning(title);
  await cleanupTracked();
});

type ArticleResponse = {
  ok: boolean;
  error?: string;
  article?: { id: string; title: string; content: string; publishAt?: string };
};

function articleBody(overrides: Record<string, unknown> = {}) {
  return {
    title: `Тест нийтлэл ${randomUUID().slice(0, 8)}`,
    excerpt: "Товч танилцуулга",
    content: "<p>Нийтлэлийн эх бие</p>",
    coverImage: "https://example.test/cover.png",
    author: "Б.Ганбат",
    featured: false,
    ...overrides,
  };
}

async function createArticle(admin: TestClient, overrides: Record<string, unknown> = {}) {
  const res = await admin.post<ArticleResponse>("/api/admin/articles", articleBody(overrides));
  if (res.body?.article?.id) {
    track("articles", res.body.article.id);
    createdTitles.push(res.body.article.title);
  }
  return res;
}

/** The notifications a title produced, so a scheduled post can be shown not to announce itself. */
async function notificationsTitled(title: string): Promise<number> {
  const { data, error } = await testDb().from("notifications").select("id, body").ilike("body", `%${title}%`);
  if (error) throw error;
  const rows = (data ?? []) as { id: string }[];
  for (const row of rows) track("notifications", row.id);
  return rows.length;
}

describe("creating an article", () => {
  it("stores one and returns it", async () => {
    const admin = await adminClient("full");
    const res = await createArticle(admin);

    expect(res.status).toBe(200);
    expect(res.body.article?.id).toBeTruthy();
  });

  describe("required fields", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["no title", { title: "" }],
      ["whitespace title", { title: "   " }],
      ["no excerpt", { excerpt: "" }],
      ["no cover image", { coverImage: "" }],
      ["no author", { author: "" }],
      ["empty content", { content: "" }],
      // Tiptap's "empty" editor is still markup, so a plain emptiness check
      // would let a blank article through.
      ["content that is only an empty paragraph", { content: "<p></p>" }],
      ["content that is only whitespace markup", { content: "<p>   </p><p><br></p>" }],
    ];

    for (const [name, overrides] of cases) {
      it(`refuses ${name}`, async () => {
        const admin = await adminClient("full");
        const res = await createArticle(admin, overrides);
        expect(res.status).toBe(400);
      });
    }

    it("accepts content that is an image with no text", async () => {
      const admin = await adminClient("full");
      const res = await createArticle(admin, { content: '<img src="https://example.test/x.png" alt="">' });
      expect(res.status).toBe(200);
    });
  });

  describe("length limits", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["title", { title: "т".repeat(MAX_LEN.articleTitle + 1) }],
      ["excerpt", { excerpt: "т".repeat(MAX_LEN.articleExcerpt + 1) }],
      ["content", { content: `<p>${"т".repeat(MAX_LEN.articleContent)}</p>` }],
      ["author", { author: "т".repeat(MAX_LEN.articleAuthor + 1) }],
    ];

    for (const [field, overrides] of cases) {
      it(`refuses an over-long ${field}`, async () => {
        const admin = await adminClient("full");
        const res = await createArticle(admin, overrides);
        expect(res.status).toBe(400);
      });
    }

    it("accepts a title of exactly the maximum length", async () => {
      const admin = await adminClient("full");
      const res = await createArticle(admin, { title: "т".repeat(MAX_LEN.articleTitle) });
      expect(res.status).toBe(200);
    });
  });

  describe("publish time", () => {
    const bad: [string, unknown][] = [
      ["a number", 1234567890],
      ["a nonsense string", "next tuesday"],
      ["an object", { at: "2026-01-01" }],
      ["an empty object", {}],
    ];

    for (const [name, publishAt] of bad) {
      it(`refuses ${name} rather than publishing immediately`, async () => {
        const admin = await adminClient("full");
        const res = await createArticle(admin, { publishAt });
        expect(res.status).toBe(400);
      });
    }

    it("treats an empty string as publish now", async () => {
      const admin = await adminClient("full");
      const res = await createArticle(admin, { publishAt: "" });
      expect(res.status).toBe(200);
      expect(res.body.article?.publishAt).toBeUndefined();
    });
  });

  describe("pasted markup is sanitized before it is stored", () => {
    it("strips a script tag", async () => {
      const admin = await adminClient("full");
      const res = await createArticle(admin, {
        content: '<p>Эхлэл</p><script>alert("xss")</script><p>Төгсгөл</p>',
      });

      expect(res.status).toBe(200);
      expect(res.body.article?.content).not.toContain("<script");
      expect(res.body.article?.content).not.toContain("alert");
      expect(res.body.article?.content).toContain("Эхлэл");
    });

    it("strips event handlers and javascript: links", async () => {
      const admin = await adminClient("full");
      const res = await createArticle(admin, {
        content:
          '<p onclick="steal()">Текст</p><a href="javascript:alert(1)">холбоос</a>' +
          '<img src="x" onerror="alert(2)">',
      });

      const content = res.body.article!.content;
      expect(content).not.toContain("onclick");
      expect(content).not.toContain("onerror");
      expect(content).not.toContain("javascript:");
    });

    it("keeps a normal link but forces rel=noreferrer", async () => {
      const admin = await adminClient("full");
      const res = await createArticle(admin, {
        content: '<p><a href="https://example.test">холбоос</a></p>',
      });

      const content = res.body.article!.content;
      expect(content).toContain("https://example.test");
      expect(content).toContain('rel="noreferrer"');
    });
  });
});

describe("a scheduled article stays out of sight until its time", () => {
  const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it("is missing from the public list page", async () => {
    const admin = await adminClient("full");
    const res = await createArticle(admin, { publishAt: future() });
    const title = res.body.article!.title;

    const page = await anonClient().get("/articles");
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(title);
  });

  it("cannot be opened directly by its own URL", async () => {
    const admin = await adminClient("full");
    const res = await createArticle(admin, { publishAt: future() });

    // Knowing the id is not supposed to be a way in — the id is in the admin
    // list, and the admin list is not the only place ids leak from.
    const page = await anonClient().get(`/articles/${res.body.article!.id}`);
    expect(page.status).toBe(404);
  });

  it("does not announce itself when it is created", async () => {
    const admin = await adminClient("full");
    const res = await createArticle(admin, { publishAt: future() });
    const title = res.body.article!.title;

    // The publish cron sends this when the time comes; sending it now would
    // point every subscriber at a page that 404s.
    await new Promise((r) => setTimeout(r, 1500));
    expect(await notificationsTitled(title)).toBe(0);
  });

  it("is visible once its publish time has passed", async () => {
    const admin = await adminClient("full");
    const res = await createArticle(admin, { publishAt: past() });
    const title = res.body.article!.title;

    const page = await anonClient().get("/articles");
    expect(page.text).toContain(title);

    const detail = await anonClient().get(`/articles/${res.body.article!.id}`);
    expect(detail.status).toBe(200);
  });

  it("is visible to the admin listing the whole time", async () => {
    const admin = await adminClient("full");
    const res = await createArticle(admin, { publishAt: future() });

    const listed = await admin.get<{ articles: { id: string }[] }>("/api/admin/articles");
    expect(listed.body.articles.map((a) => a.id)).toContain(res.body.article!.id);
  });
});

describe("updating an article", () => {
  it("refuses an id that does not exist", async () => {
    const admin = await adminClient("full");
    const res = await admin.put(`/api/admin/articles/${randomUUID()}`, { title: "Шинэ гарчиг" });
    expect(res.status).toBe(404);
  });

  it("refuses to blank a required field", async () => {
    const admin = await adminClient("full");
    const created = await createArticle(admin);
    const id = created.body.article!.id;

    for (const patch of [{ title: "" }, { excerpt: "  " }, { author: "" }, { content: "<p></p>" }]) {
      const res = await admin.put(`/api/admin/articles/${id}`, patch);
      expect(res.status, JSON.stringify(patch)).toBe(400);
    }
  });

  it("refuses an over-long field", async () => {
    const admin = await adminClient("full");
    const created = await createArticle(admin);

    const res = await admin.put(`/api/admin/articles/${created.body.article!.id}`, {
      title: "т".repeat(MAX_LEN.articleTitle + 1),
    });
    expect(res.status).toBe(400);
  });

  it("can pull a published article back to a future date", async () => {
    const admin = await adminClient("full");
    const created = await createArticle(admin);
    const id = created.body.article!.id;

    const hide = await admin.put(`/api/admin/articles/${id}`, {
      publishAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    expect(hide.status).toBe(200);

    const detail = await anonClient().get(`/articles/${id}`);
    expect(detail.status).toBe(404);
  });

  it("sanitizes edited content too", async () => {
    const admin = await adminClient("full");
    const created = await createArticle(admin);

    const res = await admin.put<ArticleResponse>(`/api/admin/articles/${created.body.article!.id}`, {
      content: '<p>Шинэчилсэн</p><script>alert("xss")</script>',
    });
    expect(res.body.article?.content).not.toContain("<script");
  });
});

describe("deleting an article", () => {
  it("refuses an id that does not exist", async () => {
    const admin = await adminClient("full");
    const res = await admin.del(`/api/admin/articles/${randomUUID()}`);
    expect(res.status).toBe(404);
  });

  it("removes it from the public site", async () => {
    const admin = await adminClient("full");
    const created = await createArticle(admin);
    const id = created.body.article!.id;
    const title = created.body.article!.title;

    expect((await admin.del(`/api/admin/articles/${id}`)).status).toBe(200);

    const detail = await anonClient().get(`/articles/${id}`);
    expect(detail.status).toBe(404);
    const list = await anonClient().get("/articles");
    expect(list.text).not.toContain(title);
  });

  it("reports a second delete of the same id as not found", async () => {
    const admin = await adminClient("full");
    const created = await createArticle(admin);
    const id = created.body.article!.id;

    expect((await admin.del(`/api/admin/articles/${id}`)).status).toBe(200);
    expect((await admin.del(`/api/admin/articles/${id}`)).status).toBe(404);
  });
});
