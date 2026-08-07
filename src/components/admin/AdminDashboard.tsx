"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalyticsStats,
  Article,
  Certificate,
  Course,
  DashboardStats,
  Notification as NotificationRecord,
  NotificationChannel,
  NotificationTargetType,
  PublicUser,
  Registration,
  YearlyProgram,
} from "@/lib/db";
import { IconCheckCircle, IconClock, IconClose } from "@/components/icons";
import type { AdminLogEntry } from "@/lib/adminLog";
import { formatCourseDate } from "@/lib/courseDate";
import { formatMnt } from "@/lib/price";
import { payMethodLabel, programAdminHref } from "@/lib/registration";

type RegistrationWithUser = Registration & { user?: PublicUser };
type Tab =
  | "dashboard"
  | "registrations"
  | "courses"
  | "articles"
  | "users"
  | "analytics"
  | "certificates"
  | "assessment"
  | "notifications"
  | "logs";

export default function AdminDashboard({
  initialRegistrations,
  initialCourses,
  yearlyPrograms,
  initialArticles,
  initialUsers,
  initialCertificates,
  assessmentFee,
  stats,
  analytics,
  viewCounts,
}: {
  initialRegistrations: RegistrationWithUser[];
  initialCourses: Course[];
  yearlyPrograms: YearlyProgram[];
  initialArticles: Article[];
  initialUsers: PublicUser[];
  initialCertificates: Certificate[];
  assessmentFee: string;
  stats: DashboardStats;
  analytics: AnalyticsStats;
  viewCounts: Record<string, number>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "dashboard";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [courses, setCourses] = useState(initialCourses);
  const [articles] = useState(initialArticles);
  const [users] = useState(initialUsers);
  const [certificates, setCertificates] = useState(initialCertificates);
  const [busyId, setBusyId] = useState<string | null>(null);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}/approve`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setRegistrations((rs) => rs.map((r) => (r.id === id ? { ...r, status: "active" } : r)));
      }
      void json;
    } finally {
      setBusyId(null);
    }
  };

  // For a QPay checkout the student abandoned, or one that simply never got
  // paid — clears it out of the queue instead of leaving it stuck forever,
  // and voids the QPay invoice so a stale QR can't move money later against
  // a registration that no longer exists on our side.
  const cancelRegistration = async (id: string) => {
    if (!confirm("Энэ бүртгэлийг цуцлах уу? QPay-ийн нэхэмжлэл хүчингүй болж, бүртгэл устана.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}/cancel`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setRegistrations((rs) => rs.filter((r) => r.id !== id));
      } else if (json.paid) {
        // Lost the race with the student's own payment — reflect reality
        // instead of leaving a stale "pending" row in view.
        setRegistrations((rs) => rs.map((r) => (r.id === id ? { ...r, status: "active" } : r)));
      } else {
        alert(json.error ?? "Цуцлахад алдаа гарлаа");
      }
    } finally {
      setBusyId(null);
    }
  };

  // Archives rather than deletes — the course (and its registrations) stay
  // in the database, just hidden from the public site and the active lists.
  const archiveCourse = async (id: string) => {
    if (!confirm("Энэ сургалтыг архивлах уу? Нийтэд харагдахгүй болно, бүртгэлүүд хадгалагдаж үлдэнэ.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/courses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (res.ok) {
        setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, status: "archived" } : c)));
      }
    } finally {
      setBusyId(null);
    }
  };

  const restoreCourse = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/courses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (res.ok) {
        setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, status: "draft" } : c)));
      }
    } finally {
      setBusyId(null);
    }
  };

  const removeArticle = async (id: string) => {
    if (!confirm("Энэ нийтлэлийг устгах уу?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const upcoming = courses.filter((c) => c.kind === "upcoming" && c.status !== "archived");
  const vod = courses.filter((c) => c.kind === "vod" && c.status !== "archived");
  const archived = courses.filter((c) => c.status === "archived");
  const pendingCount = registrations.filter((r) => r.status === "pending").length;
  const activeCourseCount = upcoming.length + vod.length + yearlyPrograms.length;

  // Per-course/program active+pending registration counts for the list cards.
  const programStats = useMemo(() => {
    const map = new Map<string, { active: number; pending: number }>();
    for (const r of registrations) {
      const entry = map.get(r.programId) ?? { active: 0, pending: 0 };
      if (r.status === "active") entry.active += 1;
      else entry.pending += 1;
      map.set(r.programId, entry);
    }
    return map;
  }, [registrations]);

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="bg-navy text-white">
        <div className="wrap flex items-center justify-between h-[76px]">
          <b className="font-extrabold text-[1.1rem]">Админ хэсэг</b>
          <button type="button" onClick={logout} className="font-bold text-[.9rem] text-white/80 hover:text-white">
            Гарах
          </button>
        </div>
      </header>

      <div className="wrap py-8">
        <div className="flex gap-2 mb-7 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab("dashboard")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "dashboard" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Хяналтын самбар
          </button>
          <button
            type="button"
            onClick={() => setTab("registrations")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "registrations" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Бүртгэлүүд {pendingCount > 0 && `(${pendingCount})`}
          </button>
          <button
            type="button"
            onClick={() => setTab("courses")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "courses" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Сургалтууд ({activeCourseCount})
          </button>
          <button
            type="button"
            onClick={() => setTab("articles")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "articles" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Нийтлэл ({articles.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("users")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "users" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Хэрэглэгчид
          </button>
          <button
            type="button"
            onClick={() => setTab("analytics")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "analytics" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Хандалт
          </button>
          <button
            type="button"
            onClick={() => setTab("certificates")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "certificates" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Сертификат
          </button>
          <button
            type="button"
            onClick={() => setTab("assessment")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "assessment" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Түвшин тогтоох
          </button>
          <button
            type="button"
            onClick={() => setTab("notifications")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "notifications" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Мэдэгдэл
          </button>
          <button
            type="button"
            onClick={() => setTab("logs")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "logs" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Түүх
          </button>
        </div>

        {tab === "dashboard" && <DashboardPanel stats={stats} onOpenPending={() => setTab("registrations")} />}

        {tab === "assessment" && <AssessmentPanel initialFee={assessmentFee} />}

        {tab === "notifications" && (
          <NotificationsPanel users={users} courses={courses} yearlyPrograms={yearlyPrograms} />
        )}

        {tab === "logs" && <AdminLogsPanel />}

        {tab === "registrations" && (
          <div className="flex flex-col gap-3">
            {registrations.length === 0 && (
              <p className="text-ink-3 font-semibold text-center py-10">Бүртгэл алга байна.</p>
            )}
            {registrations.map((r) => (
              <div key={r.id} className="bg-surface border border-line rounded-md shadow-xs px-6 py-5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <Link href={programAdminHref(r.programId)} className="font-extrabold block hover:text-blue-strong hover:underline">
                    {r.programLabel}
                  </Link>
                  <span className="text-ink-3 font-semibold text-[.85rem]">
                    {r.user ? (
                      <Link href={`/admin/users/${r.user.id}`} className="hover:text-blue-strong hover:underline">
                        {r.user.lastName} {r.user.firstName} · {r.user.phone}
                      </Link>
                    ) : r.phone ? (
                      `Бүртгэл хүлээгдэж буй · ${r.phone}`
                    ) : (
                      "Хэрэглэгч устсан"
                    )}{" "}
                    · {payMethodLabel(r.payMethod)} · {r.price}
                  </span>
                </div>
                {r.status === "active" ? (
                  <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
                    <IconCheckCircle className="w-3.5 h-3.5" /> Идэвхтэй
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => cancelRegistration(r.id)}
                      className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-ink-2 bg-bg-soft px-4 py-2 rounded-full disabled:opacity-50"
                    >
                      <IconClose className="w-3.5 h-3.5" /> Цуцлах
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => approve(r.id)}
                      className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-gold-strong px-4 py-2 rounded-full disabled:opacity-50"
                    >
                      <IconClock className="w-3.5 h-3.5" /> {busyId === r.id ? "…" : "Баталгаажуулах"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "courses" && (
          <div>
            <YearlyProgramGroup programs={yearlyPrograms} viewCounts={viewCounts} programStats={programStats} />
            <div className="mt-10">
              <CourseGroup
                title="Удахгүй эхлэх сургалтууд"
                courses={upcoming}
                busyId={busyId}
                addHref="/admin/courses/new?kind=upcoming"
                onArchive={archiveCourse}
                viewCounts={viewCounts}
                programStats={programStats}
              />
            </div>
            <div className="mt-10">
              <CourseGroup
                title="Бичлэгээр үзэх сургалтууд"
                courses={vod}
                busyId={busyId}
                addHref="/admin/courses/new?kind=vod"
                onArchive={archiveCourse}
                viewCounts={viewCounts}
                programStats={programStats}
              />
            </div>
            {archived.length > 0 && (
              <div className="mt-10">
                <CourseGroup
                  title="Архивласан сургалтууд"
                  courses={archived}
                  busyId={busyId}
                  onRestore={restoreCourse}
                  viewCounts={viewCounts}
                  programStats={programStats}
                />
              </div>
            )}
          </div>
        )}

        {tab === "articles" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[1.15rem] font-extrabold">Нийтлэлүүд</h2>
              <Link
                href="/admin/articles/new"
                className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2 rounded-full"
              >
                + Нийтлэл нэмэх
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {articles.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Одоогоор алга.</p>}
              {articles.map((a) => (
                <div key={a.id} className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    {a.featured && (
                      <span className="text-[.72rem] font-extrabold tracking-[.08em] uppercase text-gold-strong">
                        Онцлох
                      </span>
                    )}
                    <b className="font-extrabold block">{a.title}</b>
                    <span className="text-ink-3 font-semibold text-[.85rem]">
                      {a.author} · {new Date(a.createdAt).toLocaleDateString("mn-MN")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/articles/${a.id}/edit`}
                      className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full"
                    >
                      Засах
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => removeArticle(a.id)}
                      className="text-[.82rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3.5 py-2 rounded-full disabled:opacity-50"
                    >
                      Устгах
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "users" && <UsersPanel users={users} registrations={registrations} />}

        {tab === "analytics" && <AnalyticsPanel data={analytics} />}

        {tab === "certificates" && (
          <CertificatesPanel certificates={certificates} setCertificates={setCertificates} />
        )}
      </div>
    </div>
  );
}

function DashboardPanel({
  stats,
  onOpenPending,
}: {
  stats: DashboardStats;
  onOpenPending: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* The one thing that needs acting on, so it leads. */}
      {stats.pendingRegistrations > 0 && (
        <button
          type="button"
          onClick={onOpenPending}
          className="bg-gold-soft border border-gold rounded-md px-6 py-5 flex items-center justify-between gap-4 flex-wrap text-left"
        >
          <div>
            <b className="font-extrabold text-[1.05rem] block">
              Баталгаажуулах төлбөр: {stats.pendingRegistrations}
            </b>
            <span className="text-ink-2 font-semibold text-[.88rem]">
              Нийт {formatMnt(stats.pendingRevenue)} хүлээгдэж байна
            </span>
          </div>
          <span className="font-extrabold text-blue-strong text-[.9rem] shrink-0">Шалгах →</span>
        </button>
      )}

      <StatSection title="Хэрэглэгчид">
        <StatTile label="Нийт бүртгүүлсэн сурагч" value={stats.students} />
        <StatTile label="Нийт бүртгүүлсэн багш" value={stats.teachers} />
        <StatTile label="Хичээлд сууж байгаа сурагч" value={stats.studentsInClass} tone="green" />
        <StatTile label="Хичээлд сууж байгаа багш" value={stats.teachersInClass} tone="green" />
      </StatSection>

      <StatSection title="Сургалт, контент">
        <StatTile label="Нийт сургалт" value={stats.courses} />
        <StatTile label="Нийтлэгдсэн" value={stats.coursesPublished} tone="green" />
        <StatTile label="Ноорог" value={stats.coursesDraft} tone="muted" />
        <StatTile label="Нийтлэл" value={stats.articles} />
      </StatSection>

      <StatSection title="Бүртгэл, төлбөр">
        <StatTile label="Идэвхтэй бүртгэл" value={stats.activeRegistrations} tone="green" />
        <StatTile label="Хүлээгдэж буй" value={stats.pendingRegistrations} tone="gold" />
        <StatTile label="Нийт орлого" value={formatMnt(stats.revenue)} tone="blue" />
        <StatTile label="Хүлээгдэж буй дүн" value={formatMnt(stats.pendingRevenue)} tone="gold" />
      </StatSection>

      <div className="grid grid-cols-1 nav:grid-cols-[1fr_1.4fr] gap-4">
        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
          <h3 className="font-extrabold text-[1rem] mb-4">Төлбөрийн хэлбэр</h3>
          <SplitRow label="QPay" value={stats.qpayCount} total={stats.qpayCount + stats.bankCount} />
          <SplitRow label="Дансаар" value={stats.bankCount} total={stats.qpayCount + stats.bankCount} />
        </div>

        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
          <h3 className="font-extrabold text-[1rem] mb-4">Хамгийн их бүртгэлтэй сургалт</h3>
          {stats.topCourses.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.9rem]">Бүртгэл алга байна.</p>
          ) : (
            <div className="flex flex-col">
              {stats.topCourses.map((c) => (
                <div
                  key={c.label}
                  className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0"
                >
                  <span className="font-bold text-[.9rem] text-ink-2 truncate">{c.label}</span>
                  <span className="shrink-0 flex items-center gap-2 text-[.82rem] font-extrabold">
                    <span className="text-green">{c.active}</span>
                    {c.pending > 0 && <span className="text-gold-strong">+{c.pending}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-ink-3 font-semibold text-[.78rem] mt-3">
            Ногоон — идэвхтэй, шар — хүлээгдэж буй
          </p>
        </div>
      </div>
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[1.05rem] font-extrabold mb-3">{title}</h2>
      <div className="grid grid-cols-2 nav:grid-cols-4 gap-3.5">{children}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "green" | "gold" | "blue" | "muted";
}) {
  const toneClass =
    tone === "green"
      ? "text-green"
      : tone === "gold"
      ? "text-gold-strong"
      : tone === "blue"
      ? "text-blue-strong"
      : tone === "muted"
      ? "text-ink-3"
      : "text-ink";
  // Money values ("2,010,000₮") are far longer than a plain count and used to
  // overflow the tile into its neighbour, so they step down a size.
  const isLongValue = String(value).length > 6;
  return (
    <div className="bg-surface border border-line rounded-md shadow-xs px-4 py-4 min-w-0">
      {/* Deliberately wraps rather than truncates: a clipped money figure
          ("2,010,00…") would read as a different number. */}
      <b
        className={`font-extrabold block tabular-nums break-words ${toneClass} ${
          isLongValue ? "text-[1.1rem] leading-[1.2]" : "text-[1.5rem] leading-none"
        }`}
      >
        {value}
      </b>
      <span className="text-ink-3 font-bold text-[.8rem] mt-1.5 block leading-[1.35]">{label}</span>
    </div>
  );
}

function SplitRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bold text-[.9rem] text-ink-2">{label}</span>
        <b className="font-extrabold text-[.9rem]">
          {value} <span className="text-ink-3 font-bold text-[.8rem]">({pct}%)</span>
        </b>
      </div>
      <div className="h-1.5 rounded-sm bg-bg-soft overflow-hidden">
        <div className="h-full bg-blue rounded-sm" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Харсан / Бүртгүүлсэн / Хүлээгдэж буй chips shared by course and yearly-program cards. */
function CardStats({ viewed, active, pending }: { viewed: number; active: number; pending: number }) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[.8rem] font-bold text-ink-3">
      <span>
        Харсан <b className="font-extrabold text-ink-2">{viewed}</b>
      </span>
      <span>
        Бүртгүүлсэн <b className="font-extrabold text-ink-2">{active}</b>
      </span>
      {pending > 0 && (
        <span className="text-gold-strong">
          Төлбөр хүлээгдэж буй <b className="font-extrabold">{pending}</b>
        </span>
      )}
    </div>
  );
}

function CourseGroup({
  title,
  courses,
  busyId,
  addHref,
  onArchive,
  onRestore,
  viewCounts,
  programStats,
}: {
  title: string;
  courses: Course[];
  busyId: string | null;
  addHref?: string;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  viewCounts: Record<string, number>;
  programStats: Map<string, { active: number; pending: number }>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[1.15rem] font-extrabold">{title}</h2>
        {addHref && (
          <Link
            href={addHref}
            className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2 rounded-full"
          >
            + Сургалт нэмэх
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {courses.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Одоогоор алга.</p>}
        {courses.map((c) => {
          const stats = programStats.get(c.id) ?? { active: 0, pending: 0 };
          return (
            <div key={c.id} className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[.72rem] font-extrabold tracking-[.08em] uppercase text-blue-strong">{c.tag}</span>
                  {c.status === "draft" ? (
                    <span className="text-[.7rem] font-extrabold text-ink-3 bg-bg-soft px-2 py-0.5 rounded-full">Ноорог</span>
                  ) : c.status === "archived" ? (
                    <span className="text-[.7rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-2 py-0.5 rounded-full">Архивласан</span>
                  ) : (
                    <span className="text-[.7rem] font-extrabold text-green bg-green-soft px-2 py-0.5 rounded-full">Нийтлэгдсэн</span>
                  )}
                </div>
                <b className="font-extrabold block">{c.title}</b>
                <span className="text-ink-3 font-semibold text-[.85rem]">
                  {c.price} {c.period}
                  {c.startDate && ` · ${formatCourseDate(c.startDate)}`}
                  {c.mode && ` · ${c.mode}`}
                </span>
                <div className="mt-1.5">
                  <CardStats viewed={viewCounts[`/courses/${c.id}`] ?? 0} active={stats.active} pending={stats.pending} />
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/admin/courses/${c.id}`}
                  className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full"
                >
                  Дэлгэрэнгүй
                </Link>
                {onRestore && (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => onRestore(c.id)}
                    className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full disabled:opacity-50"
                  >
                    Сэргээх
                  </button>
                )}
                {onArchive && (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => onArchive(c.id)}
                    className="text-[.82rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3.5 py-2 rounded-full disabled:opacity-50"
                  >
                    Архивлах
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The two yearly programs — fixed, never added/archived, only edited. */
function YearlyProgramGroup({
  programs,
  viewCounts,
  programStats,
}: {
  programs: YearlyProgram[];
  viewCounts: Record<string, number>;
  programStats: Map<string, { active: number; pending: number }>;
}) {
  return (
    <div>
      <h2 className="text-[1.15rem] font-extrabold mb-3">1 жилийн хөтөлбөр</h2>
      <div className="flex flex-col gap-2.5">
        {programs.map((p) => {
          const stats = programStats.get(p.id) ?? { active: 0, pending: 0 };
          return (
            <div
              key={p.id}
              className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
            >
              <div>
                <span className="text-[.72rem] font-extrabold tracking-[.08em] uppercase text-blue-strong">{p.tag}</span>
                <b className="font-extrabold block">{p.title}</b>
                <span className="text-ink-3 font-semibold text-[.85rem]">
                  {p.price} {p.period} · {p.lessons.length} хичээл
                </span>
                <div className="mt-1.5">
                  <CardStats
                    viewed={viewCounts[`/courses/${p.id.replace("program-", "")}`] ?? 0}
                    active={stats.active}
                    pending={stats.pending}
                  />
                </div>
              </div>
              <Link
                href={`/admin/yearly/${p.id}`}
                className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full"
              >
                Дэлгэрэнгүй
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FILTER_INPUT_CLASS =
  "w-full px-3.5 py-2.5 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue focus:bg-surface";

function UsersPanel({
  users,
  registrations,
}: {
  users: PublicUser[];
  registrations: RegistrationWithUser[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [school, setSchool] = useState("");
  const [role, setRole] = useState<"" | "teacher" | "student">("");

  const schools = useMemo(
    () => [...new Set(users.map((u) => u.school).filter(Boolean))].sort((a, b) => a.localeCompare(b, "mn")),
    [users]
  );

  const regCountByUser = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of registrations) {
      if (!r.user) continue;
      counts.set(r.user.id, (counts.get(r.user.id) ?? 0) + 1);
    }
    return counts;
  }, [registrations]);

  const filtered = useMemo(() => {
    const nameQuery = name.trim().toLowerCase();
    const phoneQuery = phone.trim().toLowerCase();
    const emailQuery = email.trim().toLowerCase();
    return users.filter((u) => {
      if (nameQuery && !`${u.lastName} ${u.firstName}`.toLowerCase().includes(nameQuery)) return false;
      if (phoneQuery && !u.phone.toLowerCase().includes(phoneQuery)) return false;
      if (emailQuery && !u.email.toLowerCase().includes(emailQuery)) return false;
      if (school && u.school !== school) return false;
      if (role && u.role !== role) return false;
      return true;
    });
  }, [users, name, phone, email, school, role]);

  return (
    <div>
      <h2 className="text-[1.15rem] font-extrabold mb-3">
        Хэрэглэгчид ({filtered.length}
        {filtered.length !== users.length && ` / ${users.length}`})
      </h2>

      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-4 grid grid-cols-1 nav:grid-cols-5 gap-3">
        <input
          type="text"
          placeholder="Нэрээр хайх"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FILTER_INPUT_CLASS}
        />
        <input
          type="text"
          placeholder="Утасны дугаараар хайх"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={FILTER_INPUT_CLASS}
        />
        <input
          type="text"
          placeholder="Имэйлээр хайх"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FILTER_INPUT_CLASS}
        />
        <select value={school} onChange={(e) => setSchool(e.target.value)} className={FILTER_INPUT_CLASS}>
          <option value="">Бүх сургууль</option>
          {schools.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "" | "teacher" | "student")}
          className={FILTER_INPUT_CLASS}
        >
          <option value="">Бүх төрөл</option>
          <option value="student">Сурагч</option>
          <option value="teacher">Багш</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem] text-center py-10">Тохирох хэрэглэгч алга байна.</p>
      ) : (
        <div className="bg-surface border border-line rounded-md shadow-xs overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="text-ink-3 text-[.76rem] font-extrabold tracking-[.05em] uppercase">
                <th className="px-4 py-3">Нэр</th>
                <th className="px-4 py-3">Төрөл</th>
                <th className="px-4 py-3">Утас</th>
                <th className="px-4 py-3">Имэйл</th>
                <th className="px-4 py-3">Байршил</th>
                <th className="px-4 py-3">Сургууль</th>
                <th className="px-4 py-3">Анги</th>
                <th className="px-4 py-3">Бүртгэл</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => router.push(`/admin/users/${u.id}`)}
                  className="border-t border-line cursor-pointer hover:bg-bg-soft transition-colors"
                >
                  <td className="px-4 py-3 font-extrabold text-[.9rem]">
                    {u.lastName} {u.firstName}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[.7rem] font-extrabold px-2 py-0.5 rounded-full ${
                        u.role === "teacher" ? "text-gold-strong bg-gold-soft" : "text-blue-strong bg-blue-soft"
                      }`}
                    >
                      {u.role === "teacher" ? "Багш" : "Сурагч"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.phone}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.email}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">
                    {u.province || u.district ? [u.province, u.district].filter(Boolean).join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.school || "—"}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.grade || "—"}</td>
                  <td className="px-4 py-3 font-extrabold text-[.88rem]">{regCountByUser.get(u.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnalyticsPanel({ data }: { data: AnalyticsStats }) {
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.views));
  const hasDaily = data.daily.some((d) => d.views > 0);

  return (
    <div className="flex flex-col gap-6">
      <StatSection title="Хуудас үзэлт">
        <StatTile label="Өнөөдөр" value={data.viewsToday} />
        <StatTile label="Сүүлийн 7 хоног" value={data.viewsWeek} />
        <StatTile label="Сүүлийн 30 хоног" value={data.viewsMonth} />
        <StatTile label="Нийт (бүх цаг)" value={data.viewsAllTime} tone="blue" />
      </StatSection>

      <StatSection title="Давхардалгүй хэрэглэгч (cookie-оор)">
        <StatTile label="Өнөөдөр" value={data.visitorsToday} tone="green" />
        <StatTile label="Сүүлийн 7 хоног" value={data.visitorsWeek} tone="green" />
        <StatTile label="Сүүлийн 30 хоног" value={data.visitorsMonth} tone="green" />
      </StatSection>

      <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
        <h3 className="font-extrabold text-[1rem] mb-4">Өдөр тутмын үзэлт (сүүлийн 30 хоног)</h3>
        {!hasDaily ? (
          <p className="text-ink-3 font-semibold text-[.9rem]">Мэдээлэл алга байна.</p>
        ) : (
          <div className="flex items-end gap-1 h-28 overflow-x-auto">
            {data.daily.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.views}`}
                className="w-3 shrink-0 bg-blue rounded-t-xs"
                style={{ height: `${Math.max(2, Math.round((d.views / maxDaily) * 100))}%` }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 nav:grid-cols-2 gap-4">
        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
          <h3 className="font-extrabold text-[1rem] mb-4">Хамгийн их үзсэн хуудас</h3>
          {data.topPages.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.9rem]">Мэдээлэл алга байна.</p>
          ) : (
            <div className="flex flex-col">
              {data.topPages.map((p) => (
                <div
                  key={p.path}
                  className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0"
                >
                  <span className="font-bold text-[.88rem] text-ink-2 truncate">{p.path}</span>
                  <span className="shrink-0 font-extrabold text-[.85rem]">{p.views}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
          <h3 className="font-extrabold text-[1rem] mb-4">Эх сурвалж</h3>
          {data.topReferrers.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.9rem]">Мэдээлэл алга байна.</p>
          ) : (
            <div className="flex flex-col">
              {data.topReferrers.map((r) => (
                <div
                  key={r.referrer}
                  className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0"
                >
                  <span className="font-bold text-[.88rem] text-ink-2 truncate">{r.referrer}</span>
                  <span className="shrink-0 font-extrabold text-[.85rem]">{r.views}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-ink-3 font-semibold text-[.78rem]">
        Өдөр тутмын жагсаалт, хамгийн их үзсэн хуудас, эх сурвалж — эдгээр бүгд сүүлийн 30 хоногийн мэдээлэл дээр
        суурилсан. &quot;Нийт (бүх цаг)&quot; ганцаараа бүх түүхэн дүн.
      </p>
    </div>
  );
}

const emptyCertForm = {
  certificateNumber: "",
  lastName: "",
  firstName: "",
  phone: "",
  category: "",
  course: "",
  issuedDate: "",
};

function CertificatesPanel({
  certificates,
  setCertificates,
}: {
  certificates: Certificate[];
  setCertificates: React.Dispatch<React.SetStateAction<Certificate[]>>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{ imported: number; skipped: { row: number; reason: string }[] } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyCertForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyCertForm);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (c: Certificate) => {
    setEditingId(c.id);
    setForm({
      certificateNumber: c.certificateNumber,
      lastName: c.lastName,
      firstName: c.firstName,
      phone: c.phone,
      category: c.category,
      course: c.course,
      issuedDate: c.issuedDate,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(editingId ? `/api/admin/certificates/${editingId}` : "/api/admin/certificates", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      if (editingId) {
        setCertificates((cs) => cs.map((c) => (c.id === editingId ? json.certificate : c)));
      } else {
        setCertificates((cs) => [json.certificate, ...cs]);
      }
      closeForm();
    } catch {
      setFormError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/certificates", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Импорт хийхэд алдаа гарлаа");
        return;
      }
      setResult({ imported: json.imported, skipped: json.skipped });
      const listRes = await fetch("/api/admin/certificates");
      const listJson = await listRes.json();
      if (listRes.ok) setCertificates(listJson.certificates);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeCertificate = async (id: string) => {
    if (!confirm("Энэ сертификатыг устгах уу?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/certificates/${id}`, { method: "DELETE" });
      if (res.ok) setCertificates((cs) => cs.filter((c) => c.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return certificates;
    return certificates.filter(
      (c) =>
        c.certificateNumber.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        `${c.lastName} ${c.firstName}`.toLowerCase().includes(q)
    );
  }, [certificates, search]);

  return (
    <div>
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-4">
        <h2 className="text-[1.05rem] font-extrabold mb-1">Excel-ээс сертификат импортлох</h2>
        <p className="text-ink-3 font-semibold text-[.85rem] mb-3">
          Баганын нэрс: Сертификатын дугаар, Овог, Нэр, Утасны дугаар, Сургалтын ангилал, Курс, Сургалтанд хамрагдсан
          огноо. Утасны дугаараар нь хэрэглэгчийн профайлтай холбогдоно. Давхцсан дугаартай мөрийг шинэчилнэ.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={uploading}
          className="text-[.85rem] font-semibold"
        />
        {uploading && <p className="text-ink-3 font-semibold text-[.85rem] mt-2">Импортлож байна…</p>}
        {error && <p className="text-red-soft font-semibold text-[.85rem] mt-2">{error}</p>}
        {result && (
          <div className="mt-3">
            <p className="text-green font-extrabold text-[.88rem]">{result.imported} мөр импортлогдлоо.</p>
            {result.skipped.length > 0 && (
              <div className="mt-1.5">
                <p className="text-gold-strong font-extrabold text-[.85rem]">{result.skipped.length} мөр алгассан:</p>
                <ul className="text-ink-3 font-semibold text-[.82rem] list-disc pl-5">
                  {result.skipped.slice(0, 10).map((s, i) => (
                    <li key={i}>
                      {s.row}-р мөр: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {formOpen && (
        <form
          onSubmit={submitForm}
          className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-4"
        >
          <h2 className="text-[1.05rem] font-extrabold mb-3">
            {editingId ? "Сертификат засах" : "Сертификат гараар нэмэх"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Сертификатын дугаар</span>
              <input
                type="text"
                required
                value={form.certificateNumber}
                onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))}
                className={FILTER_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Утасны дугаар</span>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={FILTER_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Овог</span>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className={FILTER_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Нэр</span>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className={FILTER_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Сургалтын ангилал</span>
              <input
                type="text"
                required
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className={FILTER_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Курс</span>
              <input
                type="text"
                required
                value={form.course}
                onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))}
                className={FILTER_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Сургалтанд хамрагдсан огноо</span>
              <input
                type="date"
                required
                value={form.issuedDate}
                onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))}
                className={FILTER_INPUT_CLASS}
              />
            </label>
          </div>
          {formError && <p className="text-red-soft font-semibold text-[.85rem] mt-3">{formError}</p>}
          <div className="flex gap-2.5 mt-4">
            <button
              type="submit"
              disabled={saving}
              className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2 rounded-full disabled:opacity-50"
            >
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="text-[.85rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2 rounded-full"
            >
              Цуцлах
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-[1.15rem] font-extrabold">
          Сертификатууд ({filtered.length}
          {filtered.length !== certificates.length && ` / ${certificates.length}`})
        </h2>
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="text"
            placeholder="Дугаар эсвэл нэрээр хайх"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${FILTER_INPUT_CLASS} max-w-[260px]`}
          />
          {!formOpen && (
            <button
              type="button"
              onClick={openCreateForm}
              className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full whitespace-nowrap"
            >
              + Гараар нэмэх
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem] text-center py-10">
          {certificates.length === 0 ? "Одоогоор сертификат алга." : "Тохирох сертификат алга байна."}
        </p>
      ) : (
        <div className="bg-surface border border-line rounded-md shadow-xs overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="text-ink-3 text-[.76rem] font-extrabold tracking-[.05em] uppercase">
                <th className="px-4 py-3">Дугаар</th>
                <th className="px-4 py-3">Овог, нэр</th>
                <th className="px-4 py-3">Утас</th>
                <th className="px-4 py-3">Ангилал</th>
                <th className="px-4 py-3">Курс</th>
                <th className="px-4 py-3">Огноо</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3 font-extrabold text-[.9rem]">{c.certificateNumber}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">
                    {c.lastName} {c.firstName}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{c.phone}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{c.category}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{c.course}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">
                    {formatCourseDate(c.issuedDate)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEditForm(c)}
                      className="text-[.8rem] font-extrabold text-blue-strong bg-blue-soft px-3 py-1.5 rounded-full mr-2"
                    >
                      Засах
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => removeCertificate(c.id)}
                      className="text-[.8rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3 py-1.5 rounded-full disabled:opacity-50"
                    >
                      {busyId === c.id ? "…" : "Устгах"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Hub for the level-assessment feature: the fee (stored in app_settings so it
 * can change without a redeploy) plus links to the problem bank, the level
 * descriptions, and the grading queue.
 */
function AssessmentPanel({ initialFee }: { initialFee: string }) {
  const [fee, setFee] = useState(initialFee);
  const [savingFee, setSavingFee] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeSaved, setFeeSaved] = useState(false);

  const saveFee = async () => {
    setSavingFee(true);
    setFeeError(null);
    setFeeSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "assessment_fee", value: fee }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeeError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      setFee(json.value);
      setFeeSaved(true);
    } catch {
      setFeeError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSavingFee(false);
    }
  };

  const cards = [
    {
      href: "/admin/problems",
      title: "Бодлогын сан",
      text: "Бодлогыг LaTeX эсвэл зургаар оруулах, түвшин, хүндрэлээр нь ангилах.",
    },
    {
      href: "/admin/levels",
      title: "Түвшний тайлбар",
      text: "1-10 түвшин бүрийн хамрах хүрээ, дараагийн түвшинд гарах зам, санал болгох сургалт.",
    },
    {
      href: "/admin/grading",
      title: "Шалгах дараалал",
      text: "Илгээгдсэн бодолтыг шалгаж, багш эцсийн түвшинг тогтооно.",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
        <h2 className="text-[1.05rem] font-extrabold mb-1">Үнэлгээний төлбөр</h2>
        <p className="text-ink-3 font-semibold text-[.85rem] mb-3">
          Сурагч түвшин тогтоох тестээ эхлүүлэхийн өмнө төлөх дүн.
        </p>
        <div className="flex gap-2.5 flex-wrap items-start">
          <input
            type="text"
            value={fee}
            onChange={(e) => {
              setFee(e.target.value);
              setFeeSaved(false);
            }}
            placeholder="20,000₮"
            className={`${FILTER_INPUT_CLASS} max-w-[200px]`}
          />
          <button
            type="button"
            disabled={savingFee}
            onClick={saveFee}
            className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full disabled:opacity-50"
          >
            {savingFee ? "Хадгалж байна…" : "Хадгалах"}
          </button>
          {feeSaved && (
            <span className="text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-2 rounded-full">
              Хадгаллаа
            </span>
          )}
        </div>
        {feeError && <p className="text-red-soft font-semibold text-[.85rem] mt-2">{feeError}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card-flat px-[20px] py-[20px] hover:border-blue-soft-2"
          >
            <b className="text-[1.02rem] font-extrabold block">{c.title}</b>
            <p className="text-[.87rem] text-ink-2 font-medium mt-1.5">{c.text}</p>
            <span className="inline-block text-[.85rem] font-extrabold text-blue-strong mt-3">Нээх →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

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

function NotificationsPanel({
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
        <h2 className="text-[1.05rem] font-extrabold mb-3">Илгээсэн түүх</h2>
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
                  {n.targetType === "course" ? n.targetCourseLabel : TARGET_LABELS[n.targetType]} ·{" "}
                  {CHANNEL_LABELS[n.channel]} · {n.recipientCount} хэрэглэгч
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "course.create": "Сургалт үүсгэсэн",
  "course.update": "Сургалт засварласан",
  "yearly_program.update": "Жилийн хөтөлбөр засварласан",
  "registration.manual_add": "Бүртгэл гараар нэмсэн",
  "registration.delete": "Бүртгэл хассан",
  "registration.approve": "Бүртгэл баталгаажуулсан",
  "registration.cancel_pending": "Хүлээгдэж буй бүртгэл цуцалсан",
  "lesson.zoom_meeting_create": "Zoom meeting үүсгэсэн",
  "notification.send": "Мэдэгдэл илгээсэн",
  "setting.update": "Тохиргоо өөрчилсөн",
};

/** Loaded lazily — this tab's own data, not part of the page's initial props. */
function AdminLogsPanel() {
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
        <h3 className="font-extrabold text-[1.05rem]">Админы үйлдлийн түүх</h3>
        <p className="text-ink-3 font-semibold text-[.85rem] mt-1">
          Үнэ өөрчлөх, бүртгэл нэмэх/хасах, Zoom үүсгэх, мэдэгдэл илгээх зэрэг мэдрэмтгий үйлдлүүд
          энд бүртгэгдэнэ. Админ эрх нэг л нууц үгтэй тул &quot;хэн&quot; гэдгийг биш &quot;юу
          хийсэн бэ&quot;-г л харуулна.
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
          {state.logs.map((log) => (
            <div key={log.id} className="flex items-start justify-between gap-4 flex-wrap py-2.5 border-b border-line last:border-0">
              <div>
                <b className="font-extrabold text-[.9rem] block">{ACTION_LABELS[log.actionType] ?? log.actionType}</b>
                {log.details && (
                  <span className="text-ink-3 font-semibold text-[.8rem] block mt-0.5">
                    {Object.entries(log.details)
                      .filter(([, v]) => v !== undefined && v !== "")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </span>
                )}
              </div>
              <span className="text-ink-3 font-semibold text-[.78rem] shrink-0">
                {new Date(log.createdAt).toLocaleString("mn-MN")}
                {log.ip && ` · ${log.ip}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
