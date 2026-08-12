import { NextResponse } from "next/server";
import { deleteArticle, updateArticle } from "@/lib/db";
import { isFullAdmin } from "@/lib/session";
import { isEmptyHtml, isTooLong, MAX_LEN } from "@/lib/validate";
import { sanitizeArticleContent } from "@/lib/sanitize";

/** Same rules as the create route: "" clears the schedule, garbage is rejected. */
function parsePublishAt(value: unknown): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: "" };
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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json();

  if (
    (data.title !== undefined && !data.title.trim()) ||
    (data.excerpt !== undefined && !data.excerpt.trim()) ||
    (data.content !== undefined && isEmptyHtml(data.content)) ||
    (data.coverImage !== undefined && !data.coverImage.trim()) ||
    (data.author !== undefined && !data.author.trim())
  ) {
    return NextResponse.json({ ok: false, error: "Заавал бөглөх талбаруудыг хоослож болохгүй" }, { status: 400 });
  }
  const lengthError = validateArticleFields(data);
  if (lengthError) {
    return NextResponse.json({ ok: false, error: lengthError }, { status: 400 });
  }

  const publishAt = parsePublishAt(data.publishAt);
  if (!publishAt.ok) {
    return NextResponse.json({ ok: false, error: publishAt.error }, { status: 400 });
  }

  const article = await updateArticle(id, {
    title: data.title?.trim(),
    excerpt: data.excerpt?.trim(),
    content: data.content !== undefined ? sanitizeArticleContent(data.content) : undefined,
    coverImage: data.coverImage?.trim(),
    author: data.author?.trim(),
    featured: typeof data.featured === "boolean" ? data.featured : undefined,
    publishAt: publishAt.value,
  });

  if (!article) {
    return NextResponse.json({ ok: false, error: "Нийтлэл олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, article });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deleteArticle(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Нийтлэл олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
