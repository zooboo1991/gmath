import type { Metadata } from "next";
import PlacementProblemsPanel from "@/components/admin/PlacementProblemsPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { listPlacementProblems } from "@/lib/assessment/placementDb";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Шаталсан шалгалтын сан — Админ" };

export default async function AdminPlacementPage() {
  await requireAdminSection("assessment");
  // Хүснэгт шинэ — schema.sql-ээ ажиллуулаагүй орчинд хуудас унахгүй.
  const problems = await listPlacementProblems({}).catch(() => []);
  return (
    <div className="px-6 lg:px-10 py-8">
      <PlacementProblemsPanel initialProblems={problems} />
    </div>
  );
}
