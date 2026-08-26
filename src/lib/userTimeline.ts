import { getSupabase } from "./supabase";
import { findCourseById, findYearlyProgramById, listRegistrationsByUser, type User } from "./db";
import { formatMnt } from "./price";

/** One thing that happened to this person, in the order it happened. */
export type TimelineEvent = {
  at: string;
  /** Groups the dot's colour: what kind of thing this was. */
  kind: "account" | "course" | "payment" | "lesson" | "assessment" | "chat" | "admin" | "other";
  title: string;
  detail?: string;
};

const KIND_BY_ADMIN_ACTION: Record<string, TimelineEvent["kind"]> = {
  "user.create": "account",
  "registration.manual_add": "course",
  "registration.delete": "course",
  "registration.approve": "payment",
  "registration.settle_manual": "payment",
  "registration.qpay_check_paid": "payment",
  "registration.cancel_pending": "course",
  "registration.add_payment": "payment",
  "registration.delete_payment": "payment",
  "registration.set_total_due": "payment",
};

const ADMIN_ACTION_LABELS: Record<string, string> = {
  "user.create": "Админ хэрэглэгчийг гараар үүсгэсэн",
  "registration.manual_add": "Админ бүртгэлийг гараар нэмсэн",
  "registration.delete": "Админ бүртгэлээс хассан",
  "registration.approve": "Админ бүртгэлийг баталгаажуулсан",
  "registration.settle_manual": "Админ дансаар төлсөн гэж баталгаажуулсан",
  "registration.qpay_check_paid": "QPay-ээс шалгаж баталгаажуулсан",
  "registration.cancel_pending": "Админ бүртгэлийг цуцалсан",
  "registration.add_payment": "Админ төлбөр бүртгэсэн",
  "registration.delete_payment": "Админ төлбөр хассан",
  "registration.set_total_due": "Админ төлөх дүнг тохируулсан",
};

/** "Сонгон бэлтгэл (C ангилал)" for a programme id, or the id when it is gone. */
async function programLabel(programId: string, cache: Map<string, string>): Promise<string> {
  const known = cache.get(programId);
  if (known) return known;
  const owner = (await findYearlyProgramById(programId)) ?? (await findCourseById(programId));
  const label = owner ? ("label" in owner ? owner.label : owner.title) : programId;
  cache.set(programId, label);
  return label;
}

/**
 * Everything this person did, and everything that was done to their account,
 * on one line of time.
 *
 * Assembled from the tables that already record these things rather than from
 * a new activity log — nothing here needs to be written anywhere first, so it
 * works for accounts created long before this page existed.
 */
export async function getUserTimeline(user: User): Promise<TimelineEvent[]> {
  const supabase = getSupabase();
  const events: TimelineEvent[] = [];
  const labels = new Map<string, string>();

  const [registrations, logins, assessments, chats, waitlist, adminLogs, certificates] =
    await Promise.all([
      listRegistrationsByUser(user.id, { includeCancelled: true }).catch(() => []),
      supabase
        .from("login_logs")
        .select("created_at, user_agent")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40)
        .then(({ data }) => (data ?? []) as { created_at: string; user_agent: string | null }[]),
      supabase
        .from("assessments")
        .select("created_at, updated_at, status, category")
        .eq("user_id", user.id)
        .then(({ data }) => (data ?? []) as { created_at: string; updated_at: string; status: string; category: string | null }[]),
      supabase
        .from("chat_conversations")
        .select("started_at, channel")
        .eq("user_id", user.id)
        .then(({ data }) => (data ?? []) as { started_at: string; channel: string }[]),
      supabase
        .from("waitlist_requests")
        .select("created_at, grade, note")
        .eq("user_id", user.id)
        .then(({ data }) => (data ?? []) as { created_at: string; grade: string; note: string }[]),
      supabase
        .from("admin_logs")
        .select("created_at, action_type, actor_name, details")
        .eq("target_id", user.id)
        .then(({ data }) => (data ?? []) as { created_at: string; action_type: string; actor_name: string | null; details: Record<string, unknown> | null }[]),
      supabase
        .from("certificates")
        .select("id, certificate_number")
        .eq("phone", user.phone)
        .then(({ data }) => (data ?? []) as { id: string; certificate_number: string }[]),
    ]);

  events.push({
    at: user.createdAt,
    kind: "account",
    title: "Бүртгүүлсэн",
    detail: `${user.phone}${user.school ? ` · ${user.school}` : ""}`,
  });

  for (const registration of registrations) {
    events.push({
      at: registration.createdAt,
      kind: "course",
      title: `Сургалтад бүртгүүлсэн — ${registration.programLabel}`,
      detail: `${registration.price} · ${
        registration.payMethod === "qpay" ? "QPay" : registration.payMethod === "bank" ? "Дансаар" : "Гараар"
      }${registration.status === "cancelled" ? " · дараа нь цуцалсан" : ""}`,
    });
  }

  // Payments hang off registrations, so they are fetched by the ids above.
  if (registrations.length > 0) {
    const { data } = await supabase
      .from("registration_payments")
      .select("registration_id, amount, paid_at")
      .in("registration_id", registrations.map((r) => r.id));
    for (const payment of (data ?? []) as { registration_id: string; amount: number; paid_at: string }[]) {
      const registration = registrations.find((r) => r.id === payment.registration_id);
      events.push({
        at: payment.paid_at,
        kind: "payment",
        title: `Төлбөр төлсөн — ${formatMnt(payment.amount)}`,
        detail: registration?.programLabel,
      });
    }
  }

  // Lessons attended, via the meetings the webhook attributed to this person.
  const { data: attendanceRows } = await supabase
    .from("lesson_attendance")
    .select("joined_at, left_at, lesson_meeting_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false })
    .limit(60);
  const attendance = (attendanceRows ?? []) as {
    joined_at: string;
    left_at: string | null;
    lesson_meeting_id: string;
  }[];
  if (attendance.length > 0) {
    const { data: meetingRows } = await supabase
      .from("lesson_meetings")
      .select("id, course_id, lesson_index")
      .in("id", [...new Set(attendance.map((a) => a.lesson_meeting_id))]);
    const meetings = (meetingRows ?? []) as { id: string; course_id: string; lesson_index: number }[];
    for (const row of attendance) {
      const meeting = meetings.find((m) => m.id === row.lesson_meeting_id);
      const minutes = row.left_at
        ? Math.max(1, Math.round((new Date(row.left_at).getTime() - new Date(row.joined_at).getTime()) / 60000))
        : null;
      events.push({
        at: row.joined_at,
        kind: "lesson",
        title: meeting
          ? `Хичээлд орсон — ${await programLabel(meeting.course_id, labels)} (${meeting.lesson_index + 1}-р хичээл)`
          : "Хичээлд орсон",
        detail: minutes ? `${minutes} минут` : "хичээл дуустал",
      });
    }
  }

  for (const assessment of assessments) {
    events.push({
      at: assessment.created_at,
      kind: "assessment",
      title: "Түвшин тогтоох шалгалт эхлүүлсэн",
      detail: assessment.category ? `${assessment.category} ангилал` : undefined,
    });
    if (assessment.status === "problems_submitted" || assessment.status === "grading") {
      events.push({ at: assessment.updated_at, kind: "assessment", title: "Бодолтоо илгээсэн" });
    }
    if (assessment.status === "completed") {
      events.push({ at: assessment.updated_at, kind: "assessment", title: "Багшийн дүгнэлт гарсан" });
    }
  }

  for (const request of waitlist) {
    events.push({
      at: request.created_at,
      kind: "other",
      title: `Хүлээлгийн жагсаалтад бүртгүүлсэн — ${request.grade}`,
      detail: request.note || undefined,
    });
  }

  for (const chat of chats) {
    events.push({
      at: chat.started_at,
      kind: "chat",
      title: "Чат бичсэн",
      detail: chat.channel === "messenger" ? "Messenger" : "Вэб сайт",
    });
  }

  if (certificates.length > 0) {
    const { data } = await supabase
      .from("certificate_events")
      .select("certificate_id, kind, created_at")
      .in("certificate_id", certificates.map((c) => c.id));
    for (const row of (data ?? []) as { certificate_id: string; kind: string; created_at: string }[]) {
      const certificate = certificates.find((c) => c.id === row.certificate_id);
      events.push({
        at: row.created_at,
        kind: "other",
        title: row.kind === "download" ? "Сертификатаа татсан" : "Сертификатыг нь шалгасан",
        detail: certificate?.certificate_number,
      });
    }
  }

  for (const log of adminLogs) {
    events.push({
      at: log.created_at,
      kind: KIND_BY_ADMIN_ACTION[log.action_type] ?? "admin",
      title: ADMIN_ACTION_LABELS[log.action_type] ?? log.action_type,
      detail: log.actor_name ?? undefined,
    });
  }

  for (const login of logins) {
    events.push({
      at: login.created_at,
      kind: "account",
      title: "Нэвтэрсэн",
      detail: deviceLabel(login.user_agent),
    });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 300);
}

/** "iPhone · Safari" out of a user-agent string — enough to recognise a device. */
function deviceLabel(userAgent: string | null): string | undefined {
  if (!userAgent) return undefined;
  const device = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Macintosh/.test(userAgent)
          ? "Mac"
          : /Windows/.test(userAgent)
            ? "Windows"
            : "Бусад";
  const browser = /CriOS|Chrome/.test(userAgent)
    ? "Chrome"
    : /FBAV|FBAN/.test(userAgent)
      ? "Facebook"
      : /Safari/.test(userAgent)
        ? "Safari"
        : "";
  return browser ? `${device} · ${browser}` : device;
}
