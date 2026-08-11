import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import UserObjectPage from "@/components/admin/UserObjectPage";
import {
  findUserById,
  listChatConversationsByUser,
  listLoginLogs,
  listRegistrationsByUser,
  toPublicUser,
} from "@/lib/db";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Хэрэглэгч — Админ хэсэг",
};

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const user = await findUserById(id);
  if (!user) notFound();

  const [registrations, loginLogs, chatConversations] = await Promise.all([
    listRegistrationsByUser(id),
    listLoginLogs(id),
    listChatConversationsByUser(id),
  ]);

  return (
    <UserObjectPage
      user={toPublicUser(user)}
      registrations={registrations}
      loginLogs={loginLogs}
      chatConversations={chatConversations}
    />
  );
}
