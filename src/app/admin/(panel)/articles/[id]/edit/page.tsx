import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ArticleForm from "@/components/admin/ArticleForm";
import { findArticleById } from "@/lib/db";
import { isAdmin } from "@/lib/session";
import { toEditableHtml } from "@/lib/articleContent";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Нийтлэл засах — Админ хэсэг",
};

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSection("articles");
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const article = await findArticleById(id, { includeScheduled: true });
  if (!article) notFound();

  return <ArticleForm initialArticle={{ ...article, content: toEditableHtml(article.content) }} />;
}
