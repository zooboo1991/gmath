import type { Metadata } from "next";
import ChatPanel from "@/components/admin/panels/ChatPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Чат — Админ" };

/** ChatPanel fetches its own data client-side, so this page has nothing to load. */
export default function AdminChatPage() {
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Чатботын түүх" />
      <ChatPanel />
    </div>
  );
}
