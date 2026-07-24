import { NextResponse } from "next/server";
import { addArticle, listArticles } from "@/lib/db";
import { isAdmin } from "@/lib/session";

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
