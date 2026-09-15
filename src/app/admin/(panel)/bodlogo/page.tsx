import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BodlogoPanel from "@/components/admin/BodlogoPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { listBodlogoProblems } from "@/lib/bodlogo/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Бодлогын сан — Админ" };

export default async function AdminBodlogoPage() {
  await requireAdminSection("bodlogo");
  // Хүснэгт шинэ — schema.sql-ээ ажиллуулаагүй орчинд хуудас унахгүй, хоосон
  // харагдана.
  const problems = await listBodlogoProblems().catch(() => []);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Бодлогын сан" />
      <BodlogoPanel initialProblems={problems} />
    </div>
  );
}
