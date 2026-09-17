import { NextResponse } from "next/server";
import { listSongonClasses } from "@/lib/db";
import {
  bookPlacement,
  cancelOwnBooking,
  findActiveBooking,
} from "@/lib/placementBookingDb";
import { bookableDays, buildAssessmentSlots, isBookable } from "@/lib/placementBooking";
import { getSessionUser } from "@/lib/session";

/**
 * Танхимд ирж түвшин тогтоолгох цаг захиалах — сурагчийн тал.
 *
 * Сонгож болох өдөр, цагийг сервер өөрөө тооцож өгдөг бөгөөд захиалахад
 * дахин шалгадаг: клиентээс ирсэн "би энэ цагийг сонголоо" гэдэгт найдвал
 * хуваарьт огт байхгүй цаг захиалагдаж, багш хүлээхгүй өдөр хүүхэд ирнэ.
 */

async function slots() {
  const classes = await listSongonClasses().catch(() => []);
  return buildAssessmentSlots(classes);
}

export async function GET() {
  const user = await getSessionUser();
  const days = bookableDays(await slots());
  if (!user) return NextResponse.json({ ok: true, signedIn: false, days, booking: null });

  const booking = await findActiveBooking(user.id).catch(() => undefined);
  return NextResponse.json({ ok: true, signedIn: true, days, booking: booking ?? null });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const date = typeof (body as { date?: unknown }).date === "string" ? (body as { date: string }).date : "";
  const slot = typeof (body as { slot?: unknown }).slot === "string" ? (body as { slot: string }).slot : "";

  if (!isBookable(await slots(), date, slot)) {
    return NextResponse.json(
      { ok: false, error: "Энэ өдөр, цаг сонгох боломжгүй байна. Жагсаалтаас сонгоно уу." },
      { status: 400 }
    );
  }

  const result = await bookPlacement({ userId: user.id, bookedDate: date, slot });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Та аль хэдийн цаг захиалсан байна. Хуучин цагаа болиод шинээр захиална уу." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, booking: result.booking });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = typeof (body as { id?: unknown }).id === "string" ? (body as { id: string }).id : "";
  // Эзэмшигчээр нь хязгаарлана: id таасан ч өөр хүний цагийг болиулж болохгүй.
  const cancelled = await cancelOwnBooking(id, user.id);
  if (!cancelled) {
    return NextResponse.json({ ok: false, error: "Захиалга олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
