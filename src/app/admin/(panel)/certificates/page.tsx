import type { Metadata } from "next";
import CertificatesPanel from "@/components/admin/panels/CertificatesPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { listCertificates } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Сертификат — Админ" };

export default async function AdminCertificatesPage() {
  const certificates = await listCertificates().catch(() => []);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Сертификат" />
      <CertificatesPanel initialCertificates={certificates} />
    </div>
  );
}
