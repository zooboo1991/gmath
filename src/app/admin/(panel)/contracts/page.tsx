import type { Metadata } from "next";
import ContractsPanel from "@/components/admin/panels/ContractsPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { listContractTemplates } from "@/lib/contracts/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Гэрээ — Админ" };

export default async function AdminContractsPage() {
  await requireAdminSection("contracts");
  // Хүснэгт нь шинэ — schema.sql-ээ ажиллуулаагүй орчинд бүтэн хуудас
  // унахын оронд хоосон жагсаалт харуулна.
  const templates = await listContractTemplates().catch(() => []);
  return (
    <div className="px-6 lg:px-10 py-8">
      <ContractsPanel templates={templates} />
    </div>
  );
}
