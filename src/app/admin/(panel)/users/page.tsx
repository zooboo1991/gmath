import type { Metadata } from "next";
import UsersPanel from "@/components/admin/panels/UsersPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { listAllRegistrations, listUsers } from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Хэрэглэгч — Админ" };

export default async function AdminUsersPage() {
  const role = await requireAdminSection("users");
  const [users, registrations] = await Promise.all([listUsers(), listAllRegistrations()]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Хэрэглэгч" />
      <UsersPanel initialUsers={users} registrations={registrations} canEdit={role === "full"} />
    </div>
  );
}
