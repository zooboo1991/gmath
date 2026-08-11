import type { Metadata } from "next";
import RegistrationsPanel from "@/components/admin/panels/RegistrationsPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { listAllRegistrations } from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Бүртгэл — Админ" };

export default async function AdminRegistrationsPage() {
  const role = await requireAdminSection("registrations");
  const registrations = await listAllRegistrations();
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Бүртгэл" />
      <RegistrationsPanel initialRegistrations={registrations} canEdit={role === "full"} />
    </div>
  );
}
