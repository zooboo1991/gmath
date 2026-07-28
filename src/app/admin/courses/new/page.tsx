import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CourseObjectPage from "@/components/admin/CourseObjectPage";
import type { CourseKind } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Шинэ сургалт — Админ хэсэг",
};

export default async function NewCoursePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const { kind } = await searchParams;
  const initialKind: CourseKind = kind === "vod" ? "vod" : "upcoming";

  return <CourseObjectPage course={null} initialKind={initialKind} initialRegistrations={[]} />;
}
