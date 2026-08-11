"use client";

import Link from "next/link";
import { formatDate } from "@/lib/dateFormat";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Course, CourseKind, CourseStatus, Lesson, PublicUser, Registration } from "@/lib/db";
import { IconArrowLeft, IconCheckCircle, IconClock, IconClose, IconBank, IconQrCode, IconPerson } from "@/components/icons";
import {
  buildCourseTag,
  parseCourseTag,
  COURSE_CATEGORIES,
  type CourseAudience,
  type CourseCategory,
} from "@/lib/courseTag";
import { toIsoDate } from "@/lib/courseDate";
import { parsePriceToNumber, formatMnt } from "@/lib/price";
import { payMethodLabel } from "@/lib/registration";
import AdminField from "./AdminField";
import { AnchorTab, Card, KpiTile } from "./AdminObjectPageParts";
import LessonScheduleEditor from "./LessonScheduleEditor";
import RegistrationRoster from "./RegistrationRoster";

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
  canEdit,
}: {
  course: Course | null;
  initialKind?: CourseKind;
  initialRegistrations: RegistrationWithUser[];
  /**
   * False for the read-only admin: the same page, minus everything that
   * writes. The form fields stay on screen (inside a disabled fieldset, so a
   * newly added input can't accidentally become editable) and the roster,
   * payments and report tabs keep all their figures.
   */
  canEdit: boolean;
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
    showOnHomepage: course?.showOnHomepage ?? false,
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
        router.push("/admin/courses");
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
  const manualCount = registrations.filter((r) => r.payMethod === "manual").length;

  return (
    <div className="min-h-screen bg-bg-soft">
      {/* Dynamic Page Header — key facts and global actions stay pinned while scrolling. */}
      <header className="sticky top-0 z-20 bg-surface border-b border-line">
        <div className="wrap py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin/courses"
              title="Сургалтууд рүү буцах"
              aria-label="Сургалтууд рүү буцах"
              className="w-9 h-9 rounded-full border border-line grid place-items-center text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
            >
              <IconArrowLeft className="w-4 h-4" />
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
            {!canEdit && (
              <span className="text-[.78rem] font-extrabold text-ink-3 bg-bg-soft px-3 py-1.5 rounded-full">
                Зөвхөн харах
              </span>
            )}
            {savedMessage && <span className="text-[.82rem] font-bold text-green">{savedMessage}</span>}
            {canEdit && isEditing && status === "archived" && (
              <button
                type="button"
                disabled={archiving}
                onClick={restore}
                className="text-[.85rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2.5 rounded-full disabled:opacity-50"
              >
                {archiving ? "…" : "Сэргээх"}
              </button>
            )}
            {canEdit && isEditing && status !== "archived" && (
              <button
                type="button"
                disabled={archiving}
                onClick={archive}
                className="text-[.85rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-4 py-2.5 rounded-full disabled:opacity-50"
              >
                {archiving ? "…" : "Архивлах"}
              </button>
            )}
            {canEdit && isEditing && status !== "archived" && (
              <button
                type="button"
                disabled={publishing}
                onClick={togglePublish}
                className="text-[.85rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2.5 rounded-full disabled:opacity-50"
              >
                {publishing ? "…" : status === "published" ? "Ноорог болгох" : "Нийтлэх"}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                disabled={saving || coverUploading}
                onClick={save}
                className="text-[.85rem] font-extrabold rounded-full bg-blue text-white shadow-blue px-5 py-2.5 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {saving ? "Хадгалж байна…" : "Хадгалах"}
              </button>
            )}
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
          // A fieldset, not per-input `disabled` props: one attribute disables
          // every control inside it, including ones added later.
          <fieldset disabled={!canEdit} className="flex flex-col gap-5 min-w-0 border-0 p-0 m-0">
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
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.showOnHomepage}
                    onChange={(e) => setForm((f) => ({ ...f, showOnHomepage: e.target.checked }))}
                  />
                  <span className="text-[.87rem] font-bold text-ink-2">Нүүр хуудсанд харуулах</span>
                </label>
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

            <LessonScheduleEditor
              lessons={form.lessons}
              onChange={(lessons) => setForm((f) => ({ ...f, lessons }))}
              id={course?.id}
              courseZoomLink={form.zoomLink}
            />
          </fieldset>
        )}

        {tab === "roster" && isEditing && (
          <Card title={`Бүртгүүлсэн сурагчид (${registrations.length})`}>
            <RegistrationRoster
              programId={course.id}
              registrations={registrations}
              onChange={setRegistrations}
              canEdit={canEdit}
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
                      {r.user ? (
                        <Link
                          href={`/admin/users/${r.user.id}`}
                          className="font-extrabold block text-[.92rem] hover:text-blue-strong hover:underline"
                        >
                          {r.user.lastName} {r.user.firstName}
                        </Link>
                      ) : (
                        <b className="font-extrabold block text-[.92rem]">Хэрэглэгч устсан</b>
                      )}
                      <span className="text-ink-3 font-semibold text-[.82rem] inline-flex items-center gap-1.5">
                        {r.payMethod === "qpay" ? <IconQrCode className="w-3.5 h-3.5" /> : <IconBank className="w-3.5 h-3.5" />}
                        {payMethodLabel(r.payMethod)} · {r.price}
                      </span>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={busyRegId === r.id}
                        onClick={() => approve(r.id)}
                        className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-gold-strong px-4 py-2 rounded-full disabled:opacity-50"
                      >
                        {busyRegId === r.id ? "…" : "Баталгаажуулах"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card title={`Баталгаажсан төлбөр (${active.length})`}>
              {active.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Баталгаажсан бүртгэл алга.</p>}
              <div className="flex flex-col gap-2">
                {active.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-4 flex-wrap py-2 border-b border-line last:border-0">
                    {r.user ? (
                      <Link href={`/admin/users/${r.user.id}`} className="font-bold text-[.88rem] text-ink-2 hover:text-blue-strong hover:underline">
                        {r.user.lastName} {r.user.firstName}
                      </Link>
                    ) : (
                      <span className="font-bold text-[.88rem] text-ink-2">Хэрэглэгч устсан</span>
                    )}
                    <span className="text-ink-3 font-semibold text-[.82rem]">
                      {payMethodLabel(r.payMethod)} · {r.price} · {formatDate(r.createdAt)}
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
                <div className="flex items-center justify-between py-2 border-b border-line">
                  <span className="font-bold text-[.9rem] text-ink-2 inline-flex items-center gap-1.5">
                    <IconBank className="w-3.5 h-3.5" /> Дансаар
                  </span>
                  <b className="font-extrabold">{bankCount}</b>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="font-bold text-[.9rem] text-ink-2 inline-flex items-center gap-1.5">
                    <IconPerson className="w-3.5 h-3.5" /> Гараар нэмсэн
                  </span>
                  <b className="font-extrabold">{manualCount}</b>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}


