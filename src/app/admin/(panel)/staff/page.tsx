import type { Metadata } from "next";
import StaffPanel from "@/components/admin/StaffPanel";
import { listAdminUsers } from "@/lib/adminUsers";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Эрх — Админ хэсэг" };

export default async function AdminStaffPage() {
  await requireAdminSection("staff");
  const staff = await listAdminUsers().catch(() => []);
  return <StaffPanel initialStaff={staff} />;
}
