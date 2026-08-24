import type { Metadata } from "next";
import CertificatesPanel from "@/components/admin/panels/CertificatesPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { getCertificateUsage, listCertificates } from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Сертификат — Админ" };

export default async function AdminCertificatesPage() {
  await requireAdminSection("certificates");
  const [certificates, usage] = await Promise.all([
    listCertificates().catch(() => []),
    // Newer table than the panel: an install that has not run the migration
    // yet shows zeroes rather than an error page.
    getCertificateUsage().catch(() => ({})),
  ]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Сертификат" />
      <CertificatesPanel initialCertificates={certificates} usage={usage} />
    </div>
  );
}
