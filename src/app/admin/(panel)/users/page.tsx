import type { Metadata } from "next";
import UsersPanel from "@/components/admin/panels/UsersPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import {
  getLastLoginByUser,
  listAllRegistrations,
  listPaymentsForRegistrations,
  listUsers,
} from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Хэрэглэгч — Админ" };

export default async function AdminUsersPage() {
  const role = await requireAdminSection("users");
  const [users, registrations, lastLogin] = await Promise.all([
    listUsers(),
    listAllRegistrations(),
    getLastLoginByUser().catch(() => ({})),
  ]);
  // Balances are what turn this list into something to act on, so the
  // instalments come along with the registrations they belong to.
  const payments = await listPaymentsForRegistrations(registrations.map((r) => r.id)).catch(() => []);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Хэрэглэгч" />
      <UsersPanel
        initialUsers={users}
        registrations={registrations}
        payments={payments}
        lastLogin={lastLogin}
        canEdit={role === "full"}
      />
    </div>
  );
}
