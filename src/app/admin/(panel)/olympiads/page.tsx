import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import OlympiadsPanel from "@/components/admin/panels/OlympiadsPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { can } from "@/lib/adminSections";
import { listYearlyPrograms } from "@/lib/db";
import { listOlympiads } from "@/lib/miniOlympiad/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Мини олимпиад — Админ" };

export default async function AdminOlympiadsPage() {
  const role = await requireAdminSection("olympiads");
  // New table: an install that has not run schema.sql yet shows an empty list.
  const [olympiads, programs] = await Promise.all([listOlympiads().catch(() => []), listYearlyPrograms()]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Мини олимпиад" />
      <OlympiadsPanel
        olympiads={olympiads}
        programs={programs.map((p) => ({ id: p.id, label: p.label }))}
        canEdit={can(role, "grading")}
      />
    </div>
  );
}
