import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import UserObjectPage from "@/components/admin/UserObjectPage";
import {
  findUserById,
  listChatConversationsByUser,
  listLoginLogs,
  listPaymentsForRegistrations,
  listRegistrationsByUser,
  toPublicUser,
} from "@/lib/db";
import { getUserTimeline } from "@/lib/userTimeline";
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

  const [registrations, loginLogs, chatConversations, timeline] = await Promise.all([
    // The admin sees cancelled registrations too — that is the point of keeping them.
    listRegistrationsByUser(id, { includeCancelled: true }),
    listLoginLogs(id),
    listChatConversationsByUser(id),
    // Newer tables feed this; one missing must not take the page down.
    getUserTimeline(user).catch(() => []),
  ]);

  // Instalments recorded against this student's registrations — the payment
  // tab reads them, and they are what turns a fee into a balance.
  const payments = await listPaymentsForRegistrations(registrations.map((r) => r.id)).catch(() => []);

  return (
    <UserObjectPage
      user={toPublicUser(user)}
      registrations={registrations}
      loginLogs={loginLogs}
      chatConversations={chatConversations}
      timeline={timeline}
      payments={payments}
    />
  );
}
