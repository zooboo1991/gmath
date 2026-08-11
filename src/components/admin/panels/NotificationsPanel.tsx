"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  Course,
  Notification as NotificationRecord,
  NotificationChannel,
  NotificationTargetType,
  PublicUser,
  YearlyProgram,
} from "@/lib/db";
import { programAdminHref } from "@/lib/registration";
import { FILTER_INPUT_CLASS } from "@/components/admin/panels/shared";

const TARGET_LABELS: Record<NotificationTargetType, string> = {
  all: "Бүх хэрэглэгч",
  students: "Бүх сурагчид",
  teachers: "Бүх багш нар",
  course: "Сургалтаар",
  users: "Хэрэглэгч сонгож",
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  site: "Зөвхөн сайт",
  sms: "Зөвхөн SMS",
  both: "Сайт + SMS",
};


export default function NotificationsPanel({
  users,
  courses,
  yearlyPrograms,
}: {
  users: PublicUser[];
  courses: Course[];
  yearlyPrograms: YearlyProgram[];
}) {
  const courseOptions = [
    ...yearlyPrograms.map((p) => ({ id: p.id, label: p.label })),
    ...courses.map((c) => ({ id: c.id, label: `${c.title} (${c.tag})` })),
  ];

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [targetType, setTargetType] = useState<NotificationTargetType>("all");
  const [targetCourseId, setTargetCourseId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<NotificationChannel>("site");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ recipientCount: number; smsFailures: number } | null>(null);

  const [history, setHistory] = useState<NotificationRecord[] | null>(null);
  const loadHistory = () => {
    fetch("/api/admin/notifications")
      .then((res) => res.json())
      .then((json) => setHistory(json.notifications ?? []))
      .catch(() => setHistory([]));
  };
  useEffect(() => {
    loadHistory();
  }, []);

  const uploadImage = async (file: File) => {
    setImageUploading(true);
    setSendError(null);
    try {
      const body2 = new FormData();
      body2.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: body2 });
      const json = await res.json();
      if (!res.ok) {
        setSendError(json.error ?? "Зураг байршуулахад алдаа гарлаа");
        return;
      }
      setImageUrl(json.url);
    } catch {
      setSendError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setImageUploading(false);
    }
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return `${u.lastName} ${u.firstName} ${u.phone}`.toLowerCase().includes(q);
  });

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      setSendError("Гарчиг, текстээ бөглөнө үү");
      return;
    }
    if (targetType === "course" && !targetCourseId) {
      setSendError("Сургалтаа сонгоно уу");
      return;
    }
    if (targetType === "users" && selectedUserIds.size === 0) {
      setSendError("Хэрэглэгч сонгоно уу");
      return;
    }
    setSending(true);
    setSendError(null);
    setSendResult(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          imageUrl: imageUrl || undefined,
          targetType,
          targetCourseId: targetType === "course" ? targetCourseId : undefined,
          userIds: targetType === "users" ? [...selectedUserIds] : undefined,
          channel,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSendError(json.error ?? "Илгээхэд алдаа гарлаа");
        return;
      }
      setSendResult({ recipientCount: json.notification.recipientCount, smsFailures: json.smsFailures });
      setTitle("");
      setBody("");
      setImageUrl("");
      setSelectedUserIds(new Set());
      loadHistory();
    } catch {
      setSendError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-5">
        <h2 className="text-[1.05rem] font-extrabold mb-4">Мэдэгдэл илгээх</h2>

        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Гарчиг"
            className={FILTER_INPUT_CLASS}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Текст"
            rows={4}
            className={`${FILTER_INPUT_CLASS} resize-y`}
          />

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2.5 rounded-full cursor-pointer">
              {imageUploading ? "Байршуулж байна…" : imageUrl ? "Зураг солих" : "+ Зураг оруулах"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadImage(file);
                  e.target.value = "";
                }}
              />
            </label>
            {imageUrl && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="w-12 h-12 rounded-sm object-cover border border-line-2" />
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="text-[.8rem] font-bold text-red-soft"
                >
                  Хасах
                </button>
              </div>
            )}
          </div>

          <div className="h-px bg-line my-1" />

          <div>
            <span className="text-[.85rem] font-extrabold text-ink-2 block mb-2">Хэнд илгээх</span>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(TARGET_LABELS) as NotificationTargetType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTargetType(t)}
                  className={`text-[.85rem] font-extrabold px-4 py-2 rounded-full transition-colors ${
                    targetType === t ? "bg-blue text-white" : "bg-bg-soft text-ink-2"
                  }`}
                >
                  {TARGET_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {targetType === "course" && (
            <select
              value={targetCourseId}
              onChange={(e) => setTargetCourseId(e.target.value)}
              className={FILTER_INPUT_CLASS}
            >
              <option value="">Сургалт сонгох</option>
              {courseOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}

          {targetType === "users" && (
            <div>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Нэр, утасны дугаараар хайх"
                className={FILTER_INPUT_CLASS}
              />
              <div className="mt-2 max-h-[240px] overflow-y-auto border border-line-2 rounded-xs">
                {filteredUsers.length === 0 && (
                  <p className="text-ink-3 font-semibold text-[.85rem] px-3 py-3">Олдсонгүй.</p>
                )}
                {filteredUsers.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2.5 px-3 py-2 border-b border-line last:border-0 hover:bg-bg-soft cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(u.id)}
                      onChange={() => toggleUser(u.id)}
                    />
                    <span className="text-[.87rem] font-semibold">
                      {u.lastName} {u.firstName} · {u.phone}
                    </span>
                  </label>
                ))}
              </div>
              {selectedUserIds.size > 0 && (
                <span className="text-[.8rem] font-bold text-ink-3 mt-1.5 block">
                  {selectedUserIds.size} хэрэглэгч сонгосон
                </span>
              )}
            </div>
          )}

          <div className="h-px bg-line my-1" />

          <div>
            <span className="text-[.85rem] font-extrabold text-ink-2 block mb-2">Илгээх суваг</span>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(CHANNEL_LABELS) as NotificationChannel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`text-[.85rem] font-extrabold px-4 py-2 rounded-full transition-colors ${
                    channel === c ? "bg-blue text-white" : "bg-bg-soft text-ink-2"
                  }`}
                >
                  {CHANNEL_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={sending}
            onClick={send}
            className="self-start text-[.9rem] font-extrabold text-white bg-blue px-6 py-3 rounded-full disabled:opacity-50 mt-1"
          >
            {sending ? "Илгээж байна…" : "Илгээх"}
          </button>

          {sendError && <p className="text-red-soft font-semibold text-[.85rem]">{sendError}</p>}
          {sendResult && (
            <p className="text-green font-semibold text-[.85rem]">
              {sendResult.recipientCount} хэрэглэгчид илгээгдлээ
              {sendResult.smsFailures > 0 && ` (SMS ${sendResult.smsFailures} амжилтгүй)`}
            </p>
          )}
        </div>
      </div>

      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-5">
        <h2 className="text-[1.05rem] font-extrabold mb-3">
          Илгээсэн түүх{history && history.length > 0 ? ` (${history.length})` : ""}
        </h2>
        {history === null ? (
          <p className="text-ink-3 font-semibold text-[.85rem]">Ачааллаж байна…</p>
        ) : history.length === 0 ? (
          <p className="text-ink-3 font-semibold text-[.85rem]">Одоогоор алга.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {history.map((n) => (
              <div key={n.id} className="bg-bg-soft rounded-md px-4 py-3.5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <b className="font-extrabold text-[.92rem]">{n.title}</b>
                  <span className="text-ink-3 font-semibold text-[.8rem] shrink-0">
                    {new Date(n.createdAt).toLocaleString("mn-MN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-ink-2 font-medium text-[.85rem] mt-1">{n.body}</p>
                <span className="text-ink-3 font-semibold text-[.78rem] mt-1.5 block">
                  {n.targetType === "course" ? (
                    n.targetCourseId ? (
                      <Link href={programAdminHref(n.targetCourseId)} className="hover:text-blue-strong hover:underline">
                        {n.targetCourseLabel}
                      </Link>
                    ) : (
                      n.targetCourseLabel
                    )
                  ) : (
                    TARGET_LABELS[n.targetType]
                  )}{" "}
                  · {CHANNEL_LABELS[n.channel]} · {n.recipientCount} хэрэглэгч
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
