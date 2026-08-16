import type { Metadata } from "next";
import CourseObjectPage from "@/components/admin/CourseObjectPage";
import { listArticles, type CourseKind } from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Шинэ сургалт — Админ хэсэг",
};

export default async function NewCoursePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await requireAdminSection("courseEditor");

  const { kind } = await searchParams;
  const initialKind: CourseKind = kind === "vod" ? "vod" : "upcoming";

  const articles = await listArticles({ includeScheduled: true });

  return (
    <CourseObjectPage
      canEdit
      course={null}
      initialKind={initialKind}
      initialRegistrations={[]}
      articleOptions={articles.map((a) => ({ id: a.id, title: a.title, createdAt: a.createdAt }))}
      initialArticleIds={[]}
    />
  );
}
