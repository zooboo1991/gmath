import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ArticleForm from "@/components/admin/ArticleForm";
import { isAdmin } from "@/lib/session";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Шинэ нийтлэл — Админ хэсэг",
};

export default async function NewArticlePage() {
  await requireAdminSection("articles");
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  return <ArticleForm />;
}
