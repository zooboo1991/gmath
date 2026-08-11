import type { Metadata } from "next";
import AdminLogsPanel from "@/components/admin/panels/AdminLogsPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Түүх — Админ" };

/** AdminLogsPanel fetches its own data client-side, so this page has nothing to load. */
export default async function AdminLogsPage() {
  await requireAdminSection("logs");
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Үйлдлийн түүх" />
      <AdminLogsPanel />
    </div>
  );
}
