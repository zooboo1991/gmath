import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/adminAccess";
import { ensureMeetingRoom } from "@/lib/parentMeetingDb";
import { getMeetingStartUrl } from "@/lib/zoom/client";

/**
 * "Zoom өрөө нээх" — багш тухайн өдрийн онлайн уулзалтын өрөөг хостоор нээнэ.
 *
 * Өрөө байхгүй бол энд үүсгэнэ, дараа нь Zoom-оос ШИНЭ эхлүүлэх холбоос
 * авна: start_url 2 цагийн дараа хүчингүй болдог тул хадгалсныг ашиглаж
 * болохгүй. Хуудсан дээрх энгийн холбоос тул алдааг админы хуудас руу
 * буцааж харуулна.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!(await requireCapability("lessons")).ok) {
    return NextResponse.redirect(new URL("/admin", url));
  }
  const date = url.searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) {
    return NextResponse.redirect(new URL("/admin/meetings", url));
  }
  try {
    const roomId = await ensureMeetingRoom(date);
    return NextResponse.redirect(await getMeetingStartUrl(roomId));
  } catch (err) {
    console.error("[parent-meeting] zoom room failed:", date, err);
    return NextResponse.redirect(new URL("/admin/meetings?zoom=error", url));
  }
}
