import { NextResponse } from "next/server";
import { isFullAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/adminLog";
import { createNotification, findUserById } from "@/lib/db";
import { sendSms } from "@/lib/sms/skytel";
import { transliterate } from "@/lib/mnTransliterate";
import {
  findProgramWaitlistEntryById,
  setProgramWaitlistStatus,
  type ProgramWaitlistStatus,
} from "@/lib/programWaitlist";

/**
 * "Холбогдсон" болмогц сурагчид мэдэгдэнэ.
 *
 * Утсаар "эрх нээж өгье" гэж хэлсэн байдаг тул SMS нь тэр амлалтын
 * баталгаа: хаана орж бүртгүүлэхийг хэлнэ. Төлөв солигдчихсон байдаг
 * тул мэдэгдлийн алдаа хүсэлтийг унагаж болохгүй — бүхэлдээ хамгаалалттай.
 * SMS латинаар: Skytel кириллийг эвддэг (lib/otp.ts-ийн адил).
 */
async function notifySeatOpened(entry: {
  userId: string;
  programId: string;
  programLabel: string;
}): Promise<void> {
  try {
    const programPath = `/courses/${entry.programId.replace("program-", "")}`;
    await createNotification({
      title: "Танд сул орон тоо гарлаа",
      body: `"${entry.programLabel}" сургалтын хүлээлгийн жагсаалтаас таныг холбогдсон гэж тэмдэглэлээ — одоо бүртгүүлэх боломжтой боллоо.`,
      targetType: "users",
      userIds: [entry.userId],
      channel: "site",
      link: programPath,
    });
  } catch (err) {
    console.error("[program-waitlist] notification failed:", entry.userId, err);
  }
  try {
    const user = await findUserById(entry.userId);
    if (user) {
      const course = transliterate(entry.programLabel).slice(0, 40);
      await sendSms(
        user.phone,
        `Tand sul suudal garlaa. ${course} surgaltad odoo burtguuleh bolomjtoi bolloo. gmath.mn saitad nevterch burtguulne uu.`
      );
    }
  } catch (err) {
    console.error("[program-waitlist] sms failed:", entry.userId, err);
  }
}

const STATUSES: ProgramWaitlistStatus[] = ["waiting", "notified", "closed"];

/** Дараалал дахь хүний төлөв солих: холбогдсон / хаасан. */
export async function PUT(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const id = typeof data.id === "string" ? data.id : "";
  const status = STATUSES.includes(data.status) ? (data.status as ProgramWaitlistStatus) : undefined;
  if (!id || !status) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  // Шилжилтийг мэдэхийн тулд өмнөх төлөвийг нь уншина: "Буцаах" дараад
  // дахин "Холбогдсон" дарвал дахин мэдэгдэнэ — тэр нь зориудынх.
  const before = await findProgramWaitlistEntryById(id);
  const entry = await setProgramWaitlistStatus(id, status);
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Олдсонгүй" }, { status: 404 });
  }
  if (status === "notified" && before?.status !== "notified") {
    await notifySeatOpened(entry);
  }
  await logAdminAction(request, {
    actionType: "program-waitlist.status",
    details: { program: entry.programLabel, status },
  });
  return NextResponse.json({ ok: true, entry });
}
