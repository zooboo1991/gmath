import type { Metadata } from "next";
import UsersPanel from "@/components/admin/panels/UsersPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { listAllRegistrations, listUsers } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Хэрэглэгчид — Админ" };

export default async function AdminUsersPage() {
  const [users, registrations] = await Promise.all([listUsers(), listAllRegistrations()]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Хэрэглэгчид" />
      <UsersPanel initialUsers={users} registrations={registrations} />
    </div>
  );
}
