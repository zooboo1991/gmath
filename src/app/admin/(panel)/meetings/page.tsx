import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import ParentMeetingsPanel from "@/components/admin/ParentMeetingsPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { listMeetingDays, listMeetings } from "@/lib/parentMeetingDb";
import { todayInUb } from "@/lib/parentMeeting";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Багштай уулзах цаг — Админ" };

export default async function AdminMeetingsPage() {
  await requireAdminSection("meetings");
  const today = todayInUb();
  // Өнөөдрөөс хойшхи нь л хэрэгтэй: багш хэн ирэхийг харахаар энд ирдэг.
  // Хүснэгт шинэ — schema.sql-ээ ажиллуулаагүй орчинд хуудас унахгүй.
  const [meetings, days] = await Promise.all([
    listMeetings({ fromDate: today }).catch(() => []),
    listMeetingDays().catch(() => []),
  ]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Багштай уулзах цаг" />
      <ParentMeetingsPanel initialMeetings={meetings} initialDays={days} today={today} />
    </div>
  );
}
