import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AttendancePanel from "@/components/admin/panels/AttendancePanel";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ирц бүртгэх — Админ" };

/** The panel fetches today's lessons itself, so this page has nothing to load. */
export default async function AdminAttendancePage() {
  await requireAdminSection("attendance");
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Ирц бүртгэх" />
      <AttendancePanel />
    </div>
  );
}
