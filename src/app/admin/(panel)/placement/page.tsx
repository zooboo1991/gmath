import type { Metadata } from "next";
import PlacementProblemsPanel from "@/components/admin/PlacementProblemsPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { countPlacementSittings, listPlacementProblems } from "@/lib/assessment/placementDb";
import { getPlacementFee, getPlacementGrades, getPlacementMinutes } from "@/lib/assessment/db";
import { DEFAULT_PLACEMENT_FEE, DEFAULT_PLACEMENT_MINUTES } from "@/lib/assessment/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Шаталсан шалгалтын сан — Админ" };

export default async function AdminPlacementPage() {
  const role = await requireAdminSection("placement");
  // Хүснэгт шинэ — schema.sql-ээ ажиллуулаагүй орчинд хуудас унахгүй.
  const [problems, fee, minutes, openGrades, sittingsCount] = await Promise.all([
    listPlacementProblems({}).catch(() => []),
    getPlacementFee().catch(() => DEFAULT_PLACEMENT_FEE),
    getPlacementMinutes().catch(() => DEFAULT_PLACEMENT_MINUTES),
    getPlacementGrades().catch(() => []),
    countPlacementSittings().catch(() => 0),
  ]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <PlacementProblemsPanel
        initialProblems={problems}
        initialFee={fee}
        initialMinutes={minutes}
        initialOpenGrades={openGrades}
        canManageSettings={role === "full"}
        sittingsCount={sittingsCount}
      />
    </div>
  );
}
