import { NextResponse } from "next/server";
import { deleteArticle, updateArticle } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json();

  const article = await updateArticle(id, {
    title: data.title?.trim(),
    excerpt: data.excerpt?.trim(),
    content: data.content?.trim(),
    coverImage: data.coverImage?.trim(),
    author: data.author?.trim(),
    featured: typeof data.featured === "boolean" ? data.featured : undefined,
  });

  if (!article) {
    return NextResponse.json({ ok: false, error: "Нийтлэл олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, article });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deleteArticle(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Нийтлэл олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
