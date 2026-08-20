import { NextResponse } from "next/server";
import { createNotification, findCourseById, findYearlyProgramById, listNotificationsForAdmin } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

const TARGET_TYPES = new Set(["all", "students", "teachers", "course", "users"]);
const CHANNELS = new Set(["site", "sms", "both"]);

export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const notifications = await listNotificationsForAdmin();
  return NextResponse.json({ ok: true, notifications });
}

export async function POST(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const body = typeof data.body === "string" ? data.body.trim() : "";
  const targetType = data.targetType;
  const channel = data.channel;
  const targetCourseId = typeof data.targetCourseId === "string" ? data.targetCourseId.trim() : undefined;
  const userIds = Array.isArray(data.userIds) ? data.userIds.filter((id: unknown) => typeof id === "string") : undefined;
  const imageUrl = typeof data.imageUrl === "string" && data.imageUrl.trim() ? data.imageUrl.trim() : undefined;
  const link = typeof data.link === "string" && data.link.trim() ? data.link.trim() : undefined;

  if (!title || !body) {
    return NextResponse.json({ ok: false, error: "Гарчиг, текстээ бөглөнө үү" }, { status: 400 });
  }
  if (isTooLong(title, MAX_LEN.notificationTitle) || isTooLong(body, MAX_LEN.notificationBody)) {
    return NextResponse.json({ ok: false, error: "Гарчиг эсвэл текст хэт урт байна" }, { status: 400 });
  }
  if (!TARGET_TYPES.has(targetType)) {
    return NextResponse.json({ ok: false, error: "Хүлээн авагчийн ангилал буруу байна" }, { status: 400 });
  }
  if (!CHANNELS.has(channel)) {
    return NextResponse.json({ ok: false, error: "Илгээх сувгаа сонгоно уу" }, { status: 400 });
  }
  // A site path or a full URL — anything else ("gmath.mn/x", "javascript:…")
  // would render as a link that goes nowhere or worse.
  if (link && !link.startsWith("/") && !/^https?:\/\//i.test(link)) {
    return NextResponse.json(
      { ok: false, error: "Холбоос '/'-ээр эсвэл https://-ээр эхлэх ёстой" },
      { status: 400 }
    );
  }
  if (link && link.length > 500) {
    return NextResponse.json({ ok: false, error: "Холбоос хэт урт байна" }, { status: 400 });
  }
  if (targetType === "course" && !targetCourseId) {
    return NextResponse.json({ ok: false, error: "Сургалтаа сонгоно уу" }, { status: 400 });
  }
  if (targetType === "users" && (!userIds || userIds.length === 0)) {
    return NextResponse.json({ ok: false, error: "Хэрэглэгч сонгоно уу" }, { status: 400 });
  }

  // The course/program label is resolved server-side (never trust a
  // client-supplied label) so admin history stays accurate even if a course
  // gets renamed or archived later.
  let targetCourseLabel: string | undefined;
  if (targetType === "course" && targetCourseId) {
    const yearlyProgram = await findYearlyProgramById(targetCourseId);
    if (yearlyProgram) {
      targetCourseLabel = yearlyProgram.label;
    } else {
      const course = await findCourseById(targetCourseId);
      if (!course) {
        return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
      }
      targetCourseLabel = `${course.title} (${course.tag})`;
    }
  }

  const { notification, smsFailures } = await createNotification({
    title,
    body,
    imageUrl,
    targetType,
    targetCourseId: targetType === "course" ? targetCourseId : undefined,
    targetCourseLabel,
    userIds: targetType === "users" ? userIds : undefined,
    channel,
    link,
  });

  await logAdminAction(request, {
    actionType: "notification.send",
    targetId: notification.id,
    details: { title, targetType, channel, recipientCount: notification.recipientCount, smsFailures },
  });

  return NextResponse.json({ ok: true, notification, smsFailures });
}
