import type { Metadata } from "next";
import RegistrationsPanel from "@/components/admin/panels/RegistrationsPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { listAllRegistrations } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Бүртгэлүүд — Админ" };

export default async function AdminRegistrationsPage() {
  const registrations = await listAllRegistrations();
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Бүртгэлүүд" />
      <RegistrationsPanel initialRegistrations={registrations} />
    </div>
  );
}
