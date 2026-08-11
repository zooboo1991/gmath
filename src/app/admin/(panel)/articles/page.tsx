import type { Metadata } from "next";
import ArticlesPanel from "@/components/admin/panels/ArticlesPanel";
import { listArticles } from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Нийтлэл — Админ" };

export default async function AdminArticlesPage() {
  await requireAdminSection("articles");
  const articles = await listArticles();
  return (
    <div className="px-6 lg:px-10 py-8">
      {/* ArticlesPanel carries its own heading + add button row. */}
      <ArticlesPanel articles={articles} />
    </div>
  );
}
