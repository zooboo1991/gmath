import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import PlacementBookingsPanel from "@/components/admin/PlacementBookingsPanel";
import { requireAdminSection } from "@/lib/adminAccess";
import { listBookings } from "@/lib/placementBookingDb";
import { todayInUb } from "@/lib/placementBooking";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Түвшин тогтоох цаг — Админ" };

export default async function AdminBookingsPage() {
  await requireAdminSection("bookings");
  // Өнөөдрөөс хойшхи нь л хэрэгтэй: багш хэн ирэхийг харахаар энд ирдэг,
  // өнгөрсөн өдрүүд жагсаалтыг уртасгахаас өөр юу ч хийхгүй.
  // Хүснэгт шинэ — schema.sql-ээ ажиллуулаагүй орчинд хуудас унахгүй.
  const bookings = await listBookings({ fromDate: todayInUb() }).catch(() => []);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Түвшин тогтоох цаг" />
      <PlacementBookingsPanel initialBookings={bookings} />
    </div>
  );
}
