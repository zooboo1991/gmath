import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BankStatementsPanel from "@/components/admin/panels/BankStatementsPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { listStatements, listTransactions, loadMatchData } from "@/lib/bankStatement/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Дансны хуулга — Админ" };

export default async function AdminStatementsPage() {
  await requireAdminSection("statements");
  // New tables: an install that has not run schema.sql yet shows an empty
  // screen instead of an error page. The roster is not optional — without it
  // the screen would hide which children (and how many activations) «Батлах»
  // is about to touch.
  const [statements, transactions, data] = await Promise.all([
    listStatements().catch(() => []),
    listTransactions().catch(() => []),
    loadMatchData(),
  ]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Дансны хуулга" />
      <BankStatementsPanel initialStatements={statements} initialTransactions={transactions} roster={data.roster} />
    </div>
  );
}
