import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LevelsPanel from "@/components/admin/LevelsPanel";
import { listLevels } from "@/lib/assessment/db";
import { listCourses } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Түвшний тайлбар — Админ хэсэг",
};

export default async function AdminLevelsPage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const [levels, courses] = await Promise.all([
    listLevels().catch(() => []),
    listCourses(undefined, { includeDrafts: true }),
  ]);

  return <LevelsPanel initialLevels={levels} courses={courses} />;
}
