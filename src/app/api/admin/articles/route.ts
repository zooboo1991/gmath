import { NextResponse } from "next/server";
import { addArticle, listArticles } from "@/lib/db";
import { isAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

function validateArticleFields(data: Record<string, unknown>): string | null {
  if (isTooLong(data.title, MAX_LEN.articleTitle)) return "Гарчиг хэт урт байна";
  if (isTooLong(data.excerpt, MAX_LEN.articleExcerpt)) return "Товч танилцуулга хэт урт байна";
  if (isTooLong(data.content, MAX_LEN.articleContent)) return "Нийтлэлийн эх хэт урт байна";
  if (isTooLong(data.author, MAX_LEN.articleAuthor)) return "Зохиогчийн нэр хэт урт байна";
  return null;
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, articles: await listArticles() });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json();

  if (!data.title?.trim() || !data.excerpt?.trim() || !data.content?.trim() || !data.coverImage?.trim() || !data.author?.trim()) {
    return NextResponse.json({ ok: false, error: "Заавал бөглөх талбарууд дутуу байна" }, { status: 400 });
  }
  const lengthError = validateArticleFields(data);
  if (lengthError) {
    return NextResponse.json({ ok: false, error: lengthError }, { status: 400 });
  }

  const article = await addArticle({
    title: data.title.trim(),
    excerpt: data.excerpt.trim(),
    content: data.content.trim(),
    coverImage: data.coverImage.trim(),
    author: data.author.trim(),
    featured: Boolean(data.featured),
  });

  return NextResponse.json({ ok: true, article });
}
