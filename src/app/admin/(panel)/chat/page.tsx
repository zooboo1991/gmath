import type { Metadata } from "next";
import ChatTabs from "@/components/admin/panels/ChatTabs";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Чат — Админ" };

/** Both panels fetch their own data client-side, so this page has nothing to load. */
export default async function AdminChatPage() {
  await requireAdminSection("chat");
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Чатботын түүх" />
      <ChatTabs />
    </div>
  );
}
