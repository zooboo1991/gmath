import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import WaitlistPanel from "@/components/admin/panels/WaitlistPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { listWaitlist } from "@/lib/waitlist";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Хүлээлгийн жагсаалт — Админ" };

export default async function AdminWaitlistPage() {
  await requireAdminSection("waitlist");
  // Newer table than the rest of the admin: an install that has not run the
  // migration shows the empty state rather than a crash.
  const requests = await listWaitlist().catch(() => []);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Хүлээлгийн жагсаалт" />
      <WaitlistPanel initialRequests={requests} />
    </div>
  );
}
