import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import OlympiadDetailPanel from "@/components/admin/panels/OlympiadDetailPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { can } from "@/lib/adminSections";
import { listYearlyPrograms } from "@/lib/db";
import { findOlympiad } from "@/lib/miniOlympiad/db";
import { adminDetail } from "@/lib/miniOlympiad/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Мини олимпиад — Админ" };

export default async function AdminOlympiadPage({ params }: { params: Promise<{ id: string }> }) {
  const role = await requireAdminSection("olympiads");
  const olympiad = await findOlympiad((await params).id).catch(() => undefined);
  if (!olympiad) notFound();
  const [detail, programs] = await Promise.all([adminDetail(olympiad), listYearlyPrograms()]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <Link href="/admin/olympiads" className="text-[.85rem] font-extrabold text-blue-strong">
        ← Мини олимпиад
      </Link>
      <OlympiadDetailPanel
        initial={detail}
        programLabel={programs.find((p) => p.id === olympiad.programId)?.label ?? olympiad.programId}
        canEdit={can(role, "grading")}
      />
    </div>
  );
}
