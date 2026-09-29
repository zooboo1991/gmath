import { NextResponse } from "next/server";
import { ensureMeetingJoinUrl, findUpcomingMeeting } from "@/lib/parentMeetingDb";
import { getSessionUser } from "@/lib/session";

/**
 * "Zoom-оор орох" — онлайн уулзалтад хичээлтэй адил шууд орно.
 *
 * Анх дарахад сервер гэр бүлийг тухайн өдрийн Zoom өрөөнд бүртгээд хувийн
 * холбоос руу нь шилжүүлнэ; дараагийн дарахад ижил холбоос. Холбоос
 * хуудсанд ч, SMS-д ч бичигддэггүй — энэ хаяг л цорын ганц орох зам.
 *
 * GET бөгөөд redirect хийдэг нь зориудынх: картан дээрх энгийн холбоос
 * утсан дээр ч попап хориглогчид баригдахгүй. Хоёр дахь GET бүртгэлээ
 * олж ашигладаг тул дахин дарах, урьдчилан ачаалах нь хэнийг ч хоёр удаа
 * бүртгэхгүй (/api/lessons/join-тэй ижил шалтгаан).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getSessionUser();
  // Бие даасан нэвтрэх хуудас байхгүй — профайл өөрөө нэвтрэлтийг харуулна.
  if (!user) return NextResponse.redirect(new URL("/profile", url));

  const meeting = await findUpcomingMeeting(user.id).catch(() => undefined);
  if (!meeting || meeting.mode !== "online") {
    return NextResponse.redirect(new URL("/profile", url));
  }

  try {
    const joinUrl = await ensureMeetingJoinUrl(meeting, {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
    return NextResponse.redirect(joinUrl);
  } catch (err) {
    // Утас, нэрийг логт бичихгүй — уулзалтын id хангалттай.
    console.error("[parent-meeting] zoom join failed:", meeting.id, err);
    return NextResponse.redirect(new URL("/profile?meeting=zoom-error", url));
  }
}
