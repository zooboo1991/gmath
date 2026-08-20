import { NextResponse } from "next/server";
import { addArticle, createNotification, listArticles } from "@/lib/db";
import { isFullAdmin } from "@/lib/session";
import { isEmptyHtml, isTooLong, MAX_LEN } from "@/lib/validate";
import { sanitizeArticleContent } from "@/lib/sanitize";

/**
 * The form sends an ISO string (from a datetime-local input) or "" for
 * "publish now". Anything unparseable is rejected rather than silently
 * dropped, which would publish immediately against the admin's intent.
 */
function parsePublishAt(value: unknown): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: undefined };
  if (typeof value !== "string") return { ok: false, error: "Нийтлэх цаг буруу байна" };
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return { ok: false, error: "Нийтлэх цаг буруу байна" };
  return { ok: true, value: new Date(t).toISOString() };
}

function validateArticleFields(data: Record<string, unknown>): string | null {
  if (isTooLong(data.title, MAX_LEN.articleTitle)) return "Гарчиг хэт урт байна";
  if (isTooLong(data.excerpt, MAX_LEN.articleExcerpt)) return "Товч танилцуулга хэт урт байна";
  if (isTooLong(data.content, MAX_LEN.articleContent)) return "Нийтлэлийн эх хэт урт байна";
  if (isTooLong(data.author, MAX_LEN.articleAuthor)) return "Зохиогчийн нэр хэт урт байна";
  return null;
}

export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, articles: await listArticles({ includeScheduled: true }) });
}

export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json();

  if (!data.title?.trim() || !data.excerpt?.trim() || isEmptyHtml(data.content) || !data.coverImage?.trim() || !data.author?.trim()) {
    return NextResponse.json({ ok: false, error: "Заавал бөглөх талбарууд дутуу байна" }, { status: 400 });
  }
  const lengthError = validateArticleFields(data);
  if (lengthError) {
    return NextResponse.json({ ok: false, error: lengthError }, { status: 400 });
  }

  const publishAt = parsePublishAt(data.publishAt);
  if (!publishAt.ok) {
    return NextResponse.json({ ok: false, error: publishAt.error }, { status: 400 });
  }

  const article = await addArticle({
    title: data.title.trim(),
    excerpt: data.excerpt.trim(),
    content: sanitizeArticleContent(data.content),
    coverImage: data.coverImage.trim(),
    author: data.author.trim(),
    featured: Boolean(data.featured),
    publishAt: publishAt.value,
  });

  // A scheduled article is announced by the publish cron when its time comes —
  // notifying now would tell everyone about a page they can't open yet.
  const scheduled = Boolean(article.publishAt) && Date.parse(article.publishAt!) > Date.now();
  if (!scheduled) {
    createNotification({
      title: "Шинэ нийтлэл нэмэгдлээ",
      body: `"${article.title}" нийтлэл нэмэгдлээ.`,
      targetType: "all",
      channel: "site",
      link: `/articles/${article.id}`,
    }).catch((err) => console.error("[articles] notification failed:", err));
  }

  return NextResponse.json({ ok: true, article });
}
