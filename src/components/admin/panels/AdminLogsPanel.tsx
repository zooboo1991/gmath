"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminLogEntry } from "@/lib/adminLog";
import { programAdminHref } from "@/lib/registration";

const ACTION_LABELS: Record<string, string> = {
  "user.create": "Хэрэглэгч гараар нэмсэн",
  "course.create": "Сургалт үүсгэсэн",
  "course.update": "Сургалт засварласан",
  "yearly_program.update": "Жилийн хөтөлбөр засварласан",
  "registration.manual_add": "Бүртгэл гараар нэмсэн",
  "registration.delete": "Бүртгэл хассан",
  "registration.approve": "Бүртгэл баталгаажуулсан",
  "registration.qpay_check_paid": "QPay-ээс шалгаж баталгаажуулсан",
  "registration.settle_manual": "Дансаар төлсөн гэж баталгаажуулсан",
  "registration.cancel_pending": "Хүлээгдэж буй бүртгэл цуцалсан",
  "registration.set_total_due": "Төлөх дүн тохируулсан",
  "registration.add_payment": "Төлбөр бүртгэсэн",
  "registration.delete_payment": "Төлбөр хассан",
  "lesson.zoom_meeting_create": "Zoom meeting үүсгэсэн",
  "lesson.zoom_meeting_update": "Zoom meeting-ийн цаг шинэчилсэн",
  "lesson.note_delete": "Хичээлийн тэмдэглэл хассан",
  "certificate.issue_batch": "Сертификат бөөнөөр үүсгэсэн",
  "notification.send": "Мэдэгдэл илгээсэн",
  "waitlist.status": "Хүлээлгийн жагсаалтын төлөв өөрчилсөн",
  "setting.update": "Тохиргоо өөрчилсөн",
  "messenger.profile_update": "Messenger цэс шинэчилсэн",
  "staff.create": "Эрх бүхий аккаунт үүсгэсэн",
  "staff.update": "Аккаунтын эрх/нууц үг өөрчилсөн",
  "staff.delete": "Аккаунт устгасан",
  "lesson.schedule_update": "Хичээлийн хуваарь хадгалсан",
  "exam.create": "Шалгалт үүсгэсэн",
  "exam.update": "Шалгалт засварласан",
  "exam.delete": "Шалгалт устгасан",
  "quiz_question.create": "Тестийн асуулт нэмсэн",
  "quiz_question.update": "Тестийн асуулт засварласан",
  "chat.takeover": "Чатыг өөрөө авсан (бот зогссон)",
  "chat.release": "Чатыг ботод буцаасан",
  "chat.reply": "Чатад гараар хариулсан",
  "chat_report.create": "Чатын тайлан гаргасан",
};

/** Where a log entry's course/program lives in the admin, if it still can be derived. */
function logTargetHref(log: AdminLogEntry): string | undefined {
  if (log.actionType === "user.create") {
    return log.targetId ? `/admin/users/${log.targetId}` : undefined;
  }
  if (log.actionType === "course.create" || log.actionType === "course.update" || log.actionType === "yearly_program.update") {
    return log.targetId ? programAdminHref(log.targetId) : undefined;
  }
  if (log.actionType.startsWith("lesson.zoom_meeting_")) {
    const courseId = log.targetId?.split("#")[0];
    return courseId ? programAdminHref(courseId) : undefined;
  }
  if (log.actionType.startsWith("registration.")) {
    const programId = log.details?.programId;
    return typeof programId === "string" ? programAdminHref(programId) : undefined;
  }
  return undefined;
}

/** Loaded lazily — this tab's own data, not part of the page's initial props. */

export default function AdminLogsPanel() {
  const [state, setState] = useState<{ status: "loading" | "done" | "error"; logs?: AdminLogEntry[] }>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/logs")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => {
        if (!cancelled) setState({ status: "done", logs: json.logs });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card-flat px-6 py-6">
      <div className="mb-4">
        <h3 className="font-extrabold text-[1.05rem]">
          Админы үйлдлийн түүх{state.status === "done" && state.logs && state.logs.length > 0 ? ` (${state.logs.length})` : ""}
        </h3>
        <p className="text-ink-3 font-semibold text-[.85rem] mt-1">
          Үнэ өөрчлөх, бүртгэл нэмэх/хасах, Zoom үүсгэх, мэдэгдэл илгээх зэрэг мэдрэмтгий үйлдлүүд
          энд бүртгэгдэнэ. Нэртэй аккаунтаар хийсэн үйлдэл дээр хэн болох нь харагдана; Vercel-ийн
          нууц үгээр орсон бол нэр байхгүй тул IP л үлдэнэ.
        </p>
      </div>

      {state.status === "loading" && <p className="text-ink-3 font-semibold text-[.9rem]">Ачааллаж байна…</p>}
      {state.status === "error" && (
        <p className="text-red-soft font-semibold text-[.9rem]">Ачаалахад алдаа гарлаа. Дахин оролдоно уу.</p>
      )}
      {state.status === "done" && state.logs && state.logs.length === 0 && (
        <p className="text-ink-3 font-semibold text-[.9rem]">Одоогоор бүртгэгдсэн үйлдэл алга.</p>
      )}
      {state.status === "done" && state.logs && state.logs.length > 0 && (
        <div className="flex flex-col gap-2">
          {state.logs.map((log) => {
            const href = logTargetHref(log);
            return (
            <div key={log.id} className="flex items-start justify-between gap-4 flex-wrap py-2.5 border-b border-line last:border-0">
              <div>
                {href ? (
                  <Link href={href} className="font-extrabold text-[.9rem] block hover:text-blue-strong hover:underline">
                    {ACTION_LABELS[log.actionType] ?? log.actionType}
                  </Link>
                ) : (
                  <b className="font-extrabold text-[.9rem] block">{ACTION_LABELS[log.actionType] ?? log.actionType}</b>
                )}
                {log.details && (
                  <span className="text-ink-3 font-semibold text-[.8rem] block mt-0.5">
                    {Object.entries(log.details)
                      .filter(([, v]) => v !== undefined && v !== "")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </span>
                )}
              </div>
              <span className="text-ink-3 font-semibold text-[.78rem] shrink-0 text-right">
                {log.actorName && (
                  <b className="text-ink-2 font-extrabold block">{log.actorName}</b>
                )}
                {new Date(log.createdAt).toLocaleString("mn-MN")}
                {log.ip && ` · ${log.ip}`}
              </span>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Chatbot oversight: the complaint log the bot feeds (see lib/ai/issues.ts)
 * on top, every conversation underneath. Loaded lazily like AdminLogsPanel —
 * this tab's own data, not part of the page's initial props. Transcripts are
 * fetched one at a time on expand via <ChatTranscript>.
 */
