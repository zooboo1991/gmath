"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Course, CourseKind, CourseStatus, Lesson, PublicUser, Registration } from "@/lib/db";
import { IconCheckCircle, IconClock, IconClose, IconBank, IconQrCode } from "@/components/icons";
import {
  buildCourseTag,
  parseCourseTag,
  COURSE_CATEGORIES,
  type CourseAudience,
  type CourseCategory,
} from "@/lib/courseTag";
import { toIsoDate, getWeekdayNameMn } from "@/lib/courseDate";
import { buildScheduleString, parseScheduleString } from "@/lib/lessonSchedule";
import { parsePriceToNumber, formatMnt } from "@/lib/price";
import AdminField from "./AdminField";

type RegistrationWithUser = Registration & { user?: PublicUser };
type SectionTab = "info" | "roster" | "confirm" | "report";

const PERIOD_OPTIONS = [
  { value: "/ сар", label: "Сар" },
  { value: "/ улирал", label: "Улирал" },
  { value: "/ жил", label: "Жил" },
  { value: "/ багц", label: "Багц" },
];

const MODE_OPTIONS = ["Онлайн", "Танхим", "Хосолсон"];

function normalizeMode(mode: string): string {
  if (MODE_OPTIONS.includes(mode)) return mode;
  const hasOnline = /онлайн/i.test(mode);
  const hasInPerson = /танхим/i.test(mode);
  if (hasOnline && hasInPerson) return "Хосолсон";
  if (hasInPerson) return "Танхим";
  if (hasOnline) return "Онлайн";
  return "";
}

function StatusBadge({ status }: { status: CourseStatus }) {
  if (status === "published") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[.76rem] font-extrabold text-green bg-green-soft px-3 py-1 rounded-full">
        <IconCheckCircle className="w-3 h-3" /> Нийтлэгдсэн
      </span>
    );
  }
  if (status === "archived") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[.76rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3 py-1 rounded-full">
        <IconClose className="w-3 h-3" /> Архивласан
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[.76rem] font-extrabold text-ink-3 bg-bg-soft px-3 py-1 rounded-full">
      <IconClock className="w-3 h-3" /> Ноорог
    </span>
  );
}

export default function CourseObjectPage({
  course,
  initialKind = "upcoming",
  initialRegistrations,
}: {
  course: Course | null;
  initialKind?: CourseKind;
  initialRegistrations: RegistrationWithUser[];
}) {
  const router = useRouter();
  const isEditing = course !== null;

  const [tab, setTab] = useState<SectionTab>("info");
  const [status, setStatus] = useState<CourseStatus>(course?.status ?? "draft");
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [busyRegId, setBusyRegId] = useState<string | null>(null);

  const [form, setForm] = useState({
    kind: course?.kind ?? initialKind,
    title: course?.title ?? "",
    topics: course?.topics ?? "",
    price: course?.price ?? "",
    period: course?.period ?? "",
    startDate: toIsoDate(course?.startDate),
    mode: normalizeMode(course?.mode ?? ""),
    coverImage: course?.coverImage ?? "",
    facebookGroup: course?.facebookGroup ?? "",
    zoomLink: course?.zoomLink ?? "",
    zoomMeetingId: course?.zoomMeetingId ?? "",
    zoomPasscode: course?.zoomPasscode ?? "",
    lessons: course?.lessons ?? ([] as Lesson[]),
  });
  const parsedTag = parseCourseTag(course?.tag ?? "");
  const [tagCategory, setTagCategory] = useState<CourseCategory | "">(parsedTag.category);
  const [tagAudience, setTagAudience] = useState<CourseAudience>(parsedTag.audience);
  const [tagCustomLabel, setTagCustomLabel] = useState(parsedTag.customLabel);

  const [coverUploading, setCoverUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const tag = buildCourseTag(tagCategory, tagAudience, tagCustomLabel);

  const uploadCover = async (file: File) => {
    setCoverUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Байршуулахад алдаа гарлаа");
        return;
      }
      setForm((f) => ({ ...f, coverImage: json.url }));
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setCoverUploading(false);
    }
  };

  const addLessonRow = () => {
    setForm((f) => ({ ...f, lessons: [...f.lessons, { topic: "", schedule: "" }] }));
  };
  const updateLessonRow = (index: number, patch: Partial<Lesson>) => {
    setForm((f) => ({ ...f, lessons: f.lessons.map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
  };
  const removeLessonRow = (index: number) => {
    setForm((f) => ({ ...f, lessons: f.lessons.filter((_, i) => i !== index) }));
  };

  // Keyed by lesson index rather than lesson id, matching how lesson_meetings
  // itself is keyed — see the schema comment for the tradeoff.
  const [zoomMeetingState, setZoomMeetingState] = useState<
    Record<number, { status: "loading" | "done" | "error"; joinUrl?: string; error?: string }>
  >({});

  const createZoomMeeting = async (index: number) => {
    if (!course) return;
    setZoomMeetingState((s) => ({ ...s, [index]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/admin/courses/${course.id}/lessons/${index}/zoom-meeting`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setZoomMeetingState((s) => ({ ...s, [index]: { status: "error", error: json.error } }));
        return;
      }
      setZoomMeetingState((s) => ({ ...s, [index]: { status: "done", joinUrl: json.meeting.joinUrl } }));
      // The tracked meeting is what students actually join through (their
      // own registrant link) — this just keeps the plain field a visible,
      // copyable reference for the teacher, and the fallback link for any
      // lesson index where tracking ever gets removed later.
      updateLessonRow(index, { zoomLink: json.meeting.joinUrl });
    } catch {
      setZoomMeetingState((s) => ({ ...s, [index]: { status: "error", error: "Сүлжээний алдаа гарлаа" } }));
    }
  };

  type AttendanceRow = { lastName: string; firstName: string; phone: string; joinedAt: string; leftAt?: string };
  const [attendanceState, setAttendanceState] = useState<
    Record<number, { status: "loading" | "done" | "error"; rows?: AttendanceRow[] }>
  >({});

  const toggleAttendance = async (index: number) => {
    if (attendanceState[index]) {
      setAttendanceState((s) => {
        const next = { ...s };
        delete next[index];
        return next;
      });
      return;
    }
    if (!course) return;
    setAttendanceState((s) => ({ ...s, [index]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/admin/courses/${course.id}/lessons/${index}/attendance`);
      const json = await res.json();
      if (!res.ok) {
        setAttendanceState((s) => ({ ...s, [index]: { status: "error" } }));
        return;
      }
      setAttendanceState((s) => ({ ...s, [index]: { status: "done", rows: json.attendance } }));
    } catch {
      setAttendanceState((s) => ({ ...s, [index]: { status: "error" } }));
    }
  };

  const formatMinutes = (joinedAt: string, leftAt?: string) => {
    if (!leftAt) return "одоо ч холбогдсон";
    const mins = Math.round((new Date(leftAt).getTime() - new Date(joinedAt).getTime()) / 60000);
    return `${mins} мин`;
  };

  const save = async () => {
    if (!tag.trim() || !form.title.trim() || !form.price.trim() || !form.period.trim()) {
      setError("Заавал бөглөх талбаруудыг бөглөнө үү");
      return;
    }
    setError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      const url = isEditing ? `/api/admin/courses/${course.id}` : "/api/admin/courses";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tag }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      if (isEditing) {
        setSavedMessage("Хадгалагдлаа");
        router.refresh();
      } else {
        router.push(`/admin/courses/${json.course.id}`);
      }
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    if (!isEditing) return;
    const next: CourseStatus = status === "published" ? "draft" : "published";
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Статус солиход алдаа гарлаа");
        return;
      }
      setStatus(next);
      router.refresh();
    } finally {
      setPublishing(false);
    }
  };

  const archive = async () => {
    if (!isEditing) return;
    if (!confirm("Энэ сургалтыг архивлах уу? Нийтэд харагдахгүй болно, бүртгэлүүд хадгалагдаж үлдэнэ.")) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (res.ok) {
        router.push("/admin?tab=courses");
        router.refresh();
      }
    } finally {
      setArchiving(false);
    }
  };

  const restore = async () => {
    if (!isEditing) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      const json = await res.json();
      if (res.ok) {
        setStatus("draft");
        router.refresh();
      } else {
        setError(json.error ?? "Сэргээхэд алдаа гарлаа");
      }
    } finally {
      setArchiving(false);
    }
  };

  const approve = async (id: string) => {
    setBusyRegId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}/approve`, { method: "POST" });
      if (res.ok) {
        setRegistrations((rs) => rs.map((r) => (r.id === id ? { ...r, status: "active" } : r)));
      }
    } finally {
      setBusyRegId(null);
    }
  };

  const pending = registrations.filter((r) => r.status === "pending");
  const active = registrations.filter((r) => r.status === "active");
  const totalRevenue = active.reduce((sum, r) => sum + parsePriceToNumber(r.price), 0);
  const qpayCount = registrations.filter((r) => r.payMethod === "qpay").length;
  const bankCount = registrations.filter((r) => r.payMethod === "bank").length;

  return (
    <div className="min-h-screen bg-bg-soft">
      {/* Dynamic Page Header — key facts and global actions stay pinned while scrolling. */}
      <header className="sticky top-0 z-20 bg-surface border-b border-line">
        <div className="wrap py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin?tab=courses"
              className="inline-flex items-center gap-1.5 font-extrabold text-ink-2 hover:text-ink text-[.88rem] shrink-0"
            >
              ← Буцах
            </Link>
            <div className="min-w-0 border-l border-line pl-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[.72rem] font-extrabold tracking-[.08em] uppercase text-blue-strong truncate max-w-[220px]">
                  {tag || "Ангилалгүй"}
                </span>
                <StatusBadge status={status} />
              </div>
              <b className="block text-[1.02rem] truncate max-w-[360px]">{form.title || "Шинэ сургалт"}</b>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {savedMessage && <span className="text-[.82rem] font-bold text-green">{savedMessage}</span>}
            {isEditing && status === "archived" && (
              <button
                type="button"
                disabled={archiving}
                onClick={restore}
                className="text-[.85rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2.5 rounded-full disabled:opacity-50"
              >
                {archiving ? "…" : "Сэргээх"}
              </button>
            )}
            {isEditing && status !== "archived" && (
              <button
                type="button"
                disabled={archiving}
                onClick={archive}
                className="text-[.85rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-4 py-2.5 rounded-full disabled:opacity-50"
              >
                {archiving ? "…" : "Архивлах"}
              </button>
            )}
            {isEditing && status !== "archived" && (
              <button
                type="button"
                disabled={publishing}
                onClick={togglePublish}
                className="text-[.85rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2.5 rounded-full disabled:opacity-50"
              >
                {publishing ? "…" : status === "published" ? "Ноорог болгох" : "Нийтлэх"}
              </button>
            )}
            <button
              type="button"
              disabled={saving || coverUploading}
              onClick={save}
              className="text-[.85rem] font-extrabold rounded-full bg-blue text-white shadow-blue px-5 py-2.5 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </button>
          </div>
        </div>

        {/* Anchor bar */}
        <div className="wrap flex gap-1 overflow-x-auto">
          <AnchorTab label="Үндсэн мэдээлэл" active={tab === "info"} onClick={() => setTab("info")} />
          {isEditing && (
            <>
              <AnchorTab
                label={`Бүртгэл${registrations.length ? ` (${registrations.length})` : ""}`}
                active={tab === "roster"}
                onClick={() => setTab("roster")}
              />
              <AnchorTab
                label={`Баталгаажуулалт${pending.length ? ` (${pending.length})` : ""}`}
                active={tab === "confirm"}
                onClick={() => setTab("confirm")}
              />
              <AnchorTab label="Тайлан" active={tab === "report"} onClick={() => setTab("report")} />
            </>
          )}
        </div>
      </header>

      <div className="wrap max-w-[880px] py-8">
        {error && (
          <p className="bg-[oklch(0.97_0.03_25)] text-red-soft font-semibold text-[.9rem] rounded-md px-4 py-3 mb-5">
            {error}
          </p>
        )}

        {tab === "info" && (
          <div className="flex flex-col gap-5">
            <Card title="Ерөнхий мэдээлэл">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <AdminField label="Ангилал">
                    <select value={tagCategory} onChange={(e) => setTagCategory(e.target.value as CourseCategory | "")}>
                      <option value="">Сонгохгүй</option>
                      {COURSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c} ангилал
                        </option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminField label="Хэнд зориулсан">
                    <select value={tagAudience} onChange={(e) => setTagAudience(e.target.value as CourseAudience)}>
                      <option value="student">Сурагч</option>
                      <option value="teacher">Багш</option>
                    </select>
                  </AdminField>
                </div>
                <AdminField label="Ангиллын тусгай тэмдэглэгээ (заавал биш, жишээ: ДАСГАЛЖУУЛАГЧ БАГШ)">
                  <input
                    value={tagCustomLabel}
                    onChange={(e) => setTagCustomLabel(e.target.value)}
                    placeholder={buildCourseTag(tagCategory, tagAudience, "")}
                  />
                </AdminField>
                <AdminField label="Гарчиг">
                  <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                </AdminField>
                <AdminField label="Тайлбар">
                  <input value={form.topics} onChange={(e) => setForm((f) => ({ ...f, topics: e.target.value }))} />
                </AdminField>
                <div className="grid grid-cols-2 gap-3">
                  <AdminField label="Үнэ">
                    <input
                      value={form.price}
                      onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="350,000₮"
                    />
                  </AdminField>
                  <AdminField label="Хугацааны нэгж">
                    <select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}>
                      <option value="">Сонгоно уу</option>
                      {PERIOD_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                </div>
                {form.kind === "upcoming" && (
                  <div className="grid grid-cols-2 gap-3">
                    <AdminField label="Хичээллэх өдөр">
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      />
                    </AdminField>
                    <AdminField label="Төрөл">
                      <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
                        <option value="">Сонгоно уу</option>
                        {MODE_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </AdminField>
                  </div>
                )}
                <AdminField label="Facebook группын холбоос (бүртгэл баталгаажсан сурагчид харагдана)">
                  <input
                    value={form.facebookGroup}
                    onChange={(e) => setForm((f) => ({ ...f, facebookGroup: e.target.value }))}
                    placeholder="https://www.facebook.com/groups/..."
                  />
                </AdminField>
              </div>
            </Card>

            <Card title="Zoom өрөө (бүх хичээлд)">
              <p className="text-ink-3 font-semibold text-[.85rem] -mt-2 mb-3.5">
                Давтагдах уулзалтын нэг холбоосыг энд оруулбал бүх хичээлд хэрэглэгдэнэ. Тодорхой
                хичээл өөр холбоостой бол доорх хуваарийн мөрөнд нь бичнэ. Төлбөрөө баталгаажуулсан
                сурагчид л харна.
              </p>
              <div className="flex flex-col gap-3">
                <AdminField label="Zoom холбоос">
                  <input
                    value={form.zoomLink}
                    onChange={(e) => setForm((f) => ({ ...f, zoomLink: e.target.value }))}
                    placeholder="https://us02web.zoom.us/j/..."
                  />
                </AdminField>
                <div className="grid grid-cols-2 gap-3">
                  <AdminField label="Meeting ID (заавал биш)">
                    <input
                      value={form.zoomMeetingId}
                      onChange={(e) => setForm((f) => ({ ...f, zoomMeetingId: e.target.value }))}
                      placeholder="123 4567 8901"
                    />
                  </AdminField>
                  <AdminField label="Нэвтрэх код (заавал биш)">
                    <input
                      value={form.zoomPasscode}
                      onChange={(e) => setForm((f) => ({ ...f, zoomPasscode: e.target.value }))}
                      placeholder="123456"
                    />
                  </AdminField>
                </div>
              </div>
            </Card>

            <Card title="Зураг">
              {form.coverImage && (
                <div className="relative w-full h-[200px] rounded-md overflow-hidden bg-bg-soft mb-2.5 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.coverImage} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, coverImage: "" }))}
                    aria-label="Зураг устгах"
                    className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-surface/90 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <IconClose className="w-4 h-4 text-ink-2" />
                  </button>
                </div>
              )}
              <label className="inline-flex items-center gap-2 text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2.5 rounded-full cursor-pointer">
                {coverUploading ? "Байршуулж байна…" : form.coverImage ? "Зураг солих" : "Зураг оруулах"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={coverUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) uploadCover(file);
                  }}
                />
              </label>
            </Card>

            <Card
              title="Хичээлийн хуваарь"
              action={
                <button
                  type="button"
                  onClick={addLessonRow}
                  className="text-[.8rem] font-extrabold text-blue-strong bg-blue-soft px-3 py-1.5 rounded-full shrink-0"
                >
                  + Хичээл нэмэх
                </button>
              }
            >
              <div className="flex flex-col gap-2">
                {form.lessons.map((lesson, i) => {
                  const parsed = parseScheduleString(lesson.schedule ?? "");
                  const weekday = getWeekdayNameMn(parsed.date);
                  const updateSchedule = (patch: Partial<typeof parsed>) => {
                    const next = { ...parsed, ...patch };
                    updateLessonRow(i, { schedule: buildScheduleString(next.date, next.startTime, next.endTime) });
                  };
                  return (
                    <div key={i} className="flex gap-2 items-start bg-bg-soft rounded-xs p-2.5">
                      <span className="w-7 h-7 rounded-md bg-surface border border-line-2 grid place-items-center font-extrabold text-[.8rem] shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 flex flex-col gap-1.5">
                        <input
                          value={lesson.topic}
                          onChange={(e) => updateLessonRow(i, { topic: e.target.value })}
                          placeholder="Хичээлийн сэдэв"
                          className="w-full px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.9rem] focus:outline-none focus:border-blue focus:bg-surface"
                        />
                        <div className="flex gap-1.5 items-center flex-wrap">
                          <input
                            type="date"
                            value={parsed.date}
                            onChange={(e) => updateSchedule({ date: e.target.value })}
                            className="px-2.5 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                          />
                          {weekday && <span className="text-[.78rem] font-bold text-blue-strong shrink-0">{weekday} гараг</span>}
                          <input
                            type="time"
                            value={parsed.startTime}
                            onChange={(e) => updateSchedule({ startTime: e.target.value })}
                            className="px-2.5 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                          />
                          <span className="text-ink-3 font-bold">–</span>
                          <input
                            type="time"
                            value={parsed.endTime}
                            onChange={(e) => updateSchedule({ endTime: e.target.value })}
                            className="px-2.5 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          <input
                            value={lesson.zoomLink ?? ""}
                            onChange={(e) => updateLessonRow(i, { zoomLink: e.target.value })}
                            placeholder={form.zoomLink ? "Zoom (сургалтын ерөнхийг ашиглана)" : "Zoom холбоос"}
                            className="w-full px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                          />
                          <input
                            value={lesson.recordingLink ?? ""}
                            onChange={(e) => updateLessonRow(i, { recordingLink: e.target.value })}
                            placeholder="Бичлэгийн холбоос (хичээл орсны дараа)"
                            className="w-full px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                          />
                        </div>
                        {isEditing && (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                disabled={zoomMeetingState[i]?.status === "loading"}
                                onClick={() => createZoomMeeting(i)}
                                className="text-[.78rem] font-extrabold text-blue-strong bg-blue-soft px-3 py-1.5 rounded-full disabled:opacity-50"
                              >
                                {zoomMeetingState[i]?.status === "loading"
                                  ? "Үүсгэж байна…"
                                  : "Ирц бүртгэх Zoom meeting үүсгэх"}
                              </button>
                              {zoomMeetingState[i]?.status === "done" && (
                                <span className="text-[.78rem] font-bold text-green">
                                  ✓ Үүслээ — сурагч бүрд хувийн холбоос өгнө
                                </span>
                              )}
                              {zoomMeetingState[i]?.status === "error" && (
                                <span className="text-[.78rem] font-bold text-red-soft">
                                  {zoomMeetingState[i]?.error ?? "Алдаа гарлаа"}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleAttendance(i)}
                                className="text-[.78rem] font-extrabold text-ink-2 bg-bg-soft px-3 py-1.5 rounded-full"
                              >
                                {attendanceState[i] ? "Ирц нуух" : "Ирц харах"}
                              </button>
                            </div>
                            {attendanceState[i]?.status === "loading" && (
                              <span className="text-[.78rem] font-semibold text-ink-3">Ачааллаж байна…</span>
                            )}
                            {attendanceState[i]?.status === "error" && (
                              <span className="text-[.78rem] font-bold text-red-soft">Алдаа гарлаа</span>
                            )}
                            {attendanceState[i]?.status === "done" && (
                              <div className="bg-surface border border-line-2 rounded-xs px-3 py-2">
                                {attendanceState[i]?.rows?.length === 0 ? (
                                  <span className="text-[.78rem] font-semibold text-ink-3">
                                    Ирц бүртгэгдээгүй байна.
                                  </span>
                                ) : (
                                  <ul className="flex flex-col gap-1">
                                    {attendanceState[i]?.rows?.map((r, ri) => (
                                      <li key={ri} className="text-[.8rem] font-semibold flex justify-between gap-3">
                                        <span>
                                          {r.lastName} {r.firstName} · {r.phone}
                                        </span>
                                        <span className="text-ink-3 shrink-0">
                                          {new Date(r.joinedAt).toLocaleTimeString("mn-MN", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}{" "}
                                          · {formatMinutes(r.joinedAt, r.leftAt)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLessonRow(i)}
                        aria-label="Хичээл устгах"
                        className="w-7 h-7 rounded-full bg-surface border border-line-2 grid place-items-center shrink-0 mt-0.5"
                      >
                        <IconClose className="w-3 h-3 text-ink-3" />
                      </button>
                    </div>
                  );
                })}
                {form.lessons.length === 0 && (
                  <p className="text-ink-3 font-semibold text-[.85rem]">Хичээл нэмээгүй байна.</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {tab === "roster" && isEditing && (
          <Card title="Бүртгүүлсэн сурагчид">
            <RegistrationTable
              rows={registrations}
              empty="Одоогоор бүртгэл алга байна."
              renderStatus={(r) =>
                r.status === "active" ? (
                  <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-green bg-green-soft px-2.5 py-1 rounded-full">
                    <IconCheckCircle className="w-3 h-3" /> Идэвхтэй
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-gold-strong bg-gold-soft px-2.5 py-1 rounded-full">
                    <IconClock className="w-3 h-3" /> Хүлээгдэж буй
                  </span>
                )
              }
            />
          </Card>
        )}

        {tab === "confirm" && isEditing && (
          <div className="flex flex-col gap-5">
            <Card title={`Хүлээгдэж буй төлбөр (${pending.length})`}>
              {pending.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Хүлээгдэж буй бүртгэл алга.</p>}
              <div className="flex flex-col gap-2.5">
                {pending.map((r) => (
                  <div
                    key={r.id}
                    className="bg-bg-soft rounded-md px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div>
                      <b className="font-extrabold block text-[.92rem]">
                        {r.user ? `${r.user.lastName} ${r.user.firstName}` : "Хэрэглэгч устсан"}
                      </b>
                      <span className="text-ink-3 font-semibold text-[.82rem] inline-flex items-center gap-1.5">
                        {r.payMethod === "qpay" ? <IconQrCode className="w-3.5 h-3.5" /> : <IconBank className="w-3.5 h-3.5" />}
                        {r.payMethod === "qpay" ? "QPay" : "Дансаар"} · {r.price}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busyRegId === r.id}
                      onClick={() => approve(r.id)}
                      className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-gold-strong px-4 py-2 rounded-full disabled:opacity-50"
                    >
                      {busyRegId === r.id ? "…" : "Баталгаажуулах"}
                    </button>
                  </div>
                ))}
              </div>
            </Card>

            <Card title={`Баталгаажсан төлбөр (${active.length})`}>
              {active.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Баталгаажсан бүртгэл алга.</p>}
              <div className="flex flex-col gap-2">
                {active.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-4 flex-wrap py-2 border-b border-line last:border-0">
                    <span className="font-bold text-[.88rem] text-ink-2">
                      {r.user ? `${r.user.lastName} ${r.user.firstName}` : "Хэрэглэгч устсан"}
                    </span>
                    <span className="text-ink-3 font-semibold text-[.82rem]">
                      {r.payMethod === "qpay" ? "QPay" : "Дансаар"} · {r.price} · {new Date(r.createdAt).toLocaleDateString("mn-MN")}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "report" && isEditing && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 nav:grid-cols-4 gap-3.5">
              <KpiTile label="Нийт бүртгэл" value={String(registrations.length)} />
              <KpiTile label="Идэвхтэй" value={String(active.length)} tone="green" />
              <KpiTile label="Хүлээгдэж буй" value={String(pending.length)} tone="gold" />
              <KpiTile label="Нийт орлого" value={formatMnt(totalRevenue)} tone="blue" />
            </div>
            <Card title="Төлбөрийн хэлбэрээр">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between py-2 border-b border-line">
                  <span className="font-bold text-[.9rem] text-ink-2 inline-flex items-center gap-1.5">
                    <IconQrCode className="w-3.5 h-3.5" /> QPay
                  </span>
                  <b className="font-extrabold">{qpayCount}</b>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="font-bold text-[.9rem] text-ink-2 inline-flex items-center gap-1.5">
                    <IconBank className="w-3.5 h-3.5" /> Дансаар
                  </span>
                  <b className="font-extrabold">{bankCount}</b>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function AnchorTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 font-extrabold text-[.86rem] px-4 py-3 border-b-[2.5px] transition-colors ${
        active ? "border-blue text-blue-strong" : "border-transparent text-ink-3 hover:text-ink-2"
      }`}
    >
      {label}
    </button>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-flat px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-extrabold text-[1rem] text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: "green" | "gold" | "blue" }) {
  const toneClass =
    tone === "green"
      ? "text-green"
      : tone === "gold"
      ? "text-gold-strong"
      : tone === "blue"
      ? "text-blue-strong"
      : "text-ink";
  return (
    <div className="card-flat px-4 py-4">
      <b className={`text-[1.55rem] font-extrabold block leading-none ${toneClass}`}>{value}</b>
      <span className="text-ink-3 font-bold text-[.8rem] mt-1.5 block">{label}</span>
    </div>
  );
}

function RegistrationTable({
  rows,
  empty,
  renderStatus,
}: {
  rows: RegistrationWithUser[];
  empty: string;
  renderStatus: (r: RegistrationWithUser) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="text-ink-3 font-semibold text-[.9rem]">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-left border-collapse min-w-[560px]">
        <thead>
          <tr className="text-ink-3 text-[.76rem] font-extrabold tracking-[.05em] uppercase">
            <th className="px-2 py-2">Сурагч</th>
            <th className="px-2 py-2">Утас</th>
            <th className="px-2 py-2">Огноо</th>
            <th className="px-2 py-2">Төлөв</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="px-2 py-3 font-extrabold text-[.9rem]">
                {r.user ? `${r.user.lastName} ${r.user.firstName}` : "Хэрэглэгч устсан"}
              </td>
              <td className="px-2 py-3 font-semibold text-[.88rem] text-ink-2">{r.user?.phone ?? "—"}</td>
              <td className="px-2 py-3 font-semibold text-[.88rem] text-ink-2">
                {new Date(r.createdAt).toLocaleDateString("mn-MN")}
              </td>
              <td className="px-2 py-3">{renderStatus(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
