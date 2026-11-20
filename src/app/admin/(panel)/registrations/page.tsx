import type { Metadata } from "next";
import RegistrationsPanel from "@/components/admin/panels/RegistrationsPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { listAllRegistrations, listPaymentsForRegistrations } from "@/lib/db";
import { listAllPaymentIntents } from "@/lib/paymentIntents";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Бүртгэл — Админ" };

export default async function AdminRegistrationsPage() {
  const role = await requireAdminSection("registrations");
  const registrations = await listAllRegistrations();
  const [payments, intents] = await Promise.all([
    // Зарласан үнэ биш, бодитоор орсон дүнг харуулахын тулд. Хуваан төлсөн
    // сурагч энэ жагсаалт дээр бүтэн төлсөн мэт харагдаж байсан.
    listPaymentsForRegistrations(registrations.map((r) => r.id)).catch(() => []),
    // Гэр бүлийн «Үлдэгдэл төлөх»-өөр эхлүүлсэн төлөлтүүд — бүртгэлтэй адил карт болно.
    listAllPaymentIntents().catch((err) => {
      console.error("[admin/registrations] balance payments failed to load", err);
      return [];
    }),
  ]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Бүртгэл" />
      <RegistrationsPanel
        initialRegistrations={registrations}
        payments={payments}
        intents={intents}
        canEdit={role === "full"}
      />
    </div>
  );
}
