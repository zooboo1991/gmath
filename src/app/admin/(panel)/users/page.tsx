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
import { TESTS } from "@/lib/tests";
import { getPrimaryArchetypeByUser } from "@/lib/tests/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Хэрэглэгч — Админ" };

export default async function AdminUsersPage() {
  const role = await requireAdminSection("users");
  const [users, registrations, lastLogin, archetypeByUser] = await Promise.all([
    listUsers(),
    listAllRegistrations(),
    getLastLoginByUser().catch(() => ({})),
    // Newer table than this page: an install without it shows a blank column.
    getPrimaryArchetypeByUser().catch(() => ({})),
  ]);

  // The code stored on the row means nothing to a reader — turn it into the
  // archetype's name here, where the test definitions are in hand.
  const archetypes: Record<string, string> = {};
  for (const [userId, result] of Object.entries(archetypeByUser)) {
    const name = TESTS.find((t) => t.slug === result.testSlug)?.archetypes[result.primaryCode]?.name;
    if (name) archetypes[userId] = name;
  }
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
        archetypes={archetypes}
        canEdit={role === "full"}
      />
    </div>
  );
}
