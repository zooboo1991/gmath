"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Article, Course, DashboardStats, PublicUser, Registration } from "@/lib/db";
import { IconCheckCircle, IconClock } from "@/components/icons";
import { formatCourseDate } from "@/lib/courseDate";
import { formatMnt } from "@/lib/price";

type RegistrationWithUser = Registration & { user?: PublicUser };
type Tab = "dashboard" | "registrations" | "courses" | "articles" | "users";

export default function AdminDashboard({
  initialRegistrations,
  initialCourses,
  initialArticles,
  initialUsers,
  stats,
}: {
  initialRegistrations: RegistrationWithUser[];
  initialCourses: Course[];
  initialArticles: Article[];
  initialUsers: PublicUser[];
  stats: DashboardStats;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "dashboard";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [courses, setCourses] = useState(initialCourses);
  const [articles] = useState(initialArticles);
  const [users] = useState(initialUsers);
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

  const removeCourse = async (id: string) => {
    // Deleting a course also deletes its registrations, so say how many are
    // about to go — otherwise it is silent data loss.
    const attached = registrations.filter((r) => r.programId === id).length;
    const warning = attached > 0 ? `\n\nЭнэ сургалтын ${attached} бүртгэл хамт устана.` : "";
    if (!confirm(`Энэ сургалтыг устгах уу?${warning}`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/courses/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCourses((cs) => cs.filter((c) => c.id !== id));
        setRegistrations((rs) => rs.filter((r) => r.programId !== id));
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

  const upcoming = courses.filter((c) => c.kind === "upcoming");
  const vod = courses.filter((c) => c.kind === "vod");
  const pendingCount = registrations.filter((r) => r.status === "pending").length;

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
            Сургалтууд
          </button>
          <button
            type="button"
            onClick={() => setTab("articles")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors shrink-0 ${
              tab === "articles" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Нийтлэл
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
        </div>

        {tab === "dashboard" && <DashboardPanel stats={stats} onOpenPending={() => setTab("registrations")} />}

        {tab === "registrations" && (
          <div className="flex flex-col gap-3">
            {registrations.length === 0 && (
              <p className="text-ink-3 font-semibold text-center py-10">Бүртгэл алга байна.</p>
            )}
            {registrations.map((r) => (
              <div key={r.id} className="bg-surface border border-line rounded-md shadow-xs px-6 py-5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <b className="font-extrabold block">{r.programLabel}</b>
                  <span className="text-ink-3 font-semibold text-[.85rem]">
                    {r.user ? `${r.user.lastName} ${r.user.firstName} · ${r.user.phone}` : "Хэрэглэгч устсан"} ·{" "}
                    {r.payMethod === "qpay" ? "QPay" : "Дансаар"} · {r.price}
                  </span>
                </div>
                {r.status === "active" ? (
                  <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
                    <IconCheckCircle className="w-3.5 h-3.5" /> Идэвхтэй
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => approve(r.id)}
                    className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-gold-strong px-4 py-2 rounded-full disabled:opacity-50"
                  >
                    <IconClock className="w-3.5 h-3.5" /> {busyId === r.id ? "…" : "Баталгаажуулах"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "courses" && (
          <div>
            <CourseGroup
              title="Удахгүй эхлэх сургалтууд"
              courses={upcoming}
              busyId={busyId}
              addHref="/admin/courses/new?kind=upcoming"
              onDelete={removeCourse}
            />
            <div className="mt-10">
              <CourseGroup
                title="Бичлэгээр үзэх сургалтууд"
                courses={vod}
                busyId={busyId}
                addHref="/admin/courses/new?kind=vod"
                onDelete={removeCourse}
              />
            </div>
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

        {tab === "users" && (
          <div>
            <h2 className="text-[1.15rem] font-extrabold mb-3">Хэрэглэгчид ({users.length})</h2>
            <div className="flex flex-col gap-2.5">
              {users.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Одоогоор алга.</p>}
              {users.map((u) => {
                const regCount = registrations.filter((r) => r.user?.id === u.id).length;
                return (
                  <Link
                    key={u.id}
                    href={`/admin/users/${u.id}`}
                    className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-4 flex-wrap hover:border-blue transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[.7rem] font-extrabold px-2 py-0.5 rounded-full ${
                            u.role === "teacher" ? "text-gold-strong bg-gold-soft" : "text-blue-strong bg-blue-soft"
                          }`}
                        >
                          {u.role === "teacher" ? "Багш" : "Сурагч"}
                        </span>
                        {regCount > 0 && (
                          <span className="text-[.7rem] font-extrabold text-green bg-green-soft px-2 py-0.5 rounded-full">
                            {regCount} бүртгэл
                          </span>
                        )}
                      </div>
                      <b className="font-extrabold block">
                        {u.lastName} {u.firstName}
                      </b>
                      <span className="text-ink-3 font-semibold text-[.85rem]">
                        {u.phone} · {u.email}
                        {u.school && ` · ${u.school}`}
                        {u.grade && ` · ${u.grade}`}
                      </span>
                    </div>
                    <span className="text-[.82rem] font-extrabold text-ink-2 shrink-0">Дэлгэрэнгүй →</span>
                  </Link>
                );
              })}
            </div>
          </div>
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

function CourseGroup({
  title,
  courses,
  busyId,
  addHref,
  onDelete,
}: {
  title: string;
  courses: Course[];
  busyId: string | null;
  addHref: string;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[1.15rem] font-extrabold">{title}</h2>
        <Link
          href={addHref}
          className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2 rounded-full"
        >
          + Сургалт нэмэх
        </Link>
      </div>
      <div className="flex flex-col gap-2.5">
        {courses.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Одоогоор алга.</p>}
        {courses.map((c) => (
          <div key={c.id} className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[.72rem] font-extrabold tracking-[.08em] uppercase text-blue-strong">{c.tag}</span>
                {c.status === "draft" ? (
                  <span className="text-[.7rem] font-extrabold text-ink-3 bg-bg-soft px-2 py-0.5 rounded-full">Ноорог</span>
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
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/courses/${c.id}`}
                className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full"
              >
                Засах
              </Link>
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => onDelete(c.id)}
                className="text-[.82rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3.5 py-2 rounded-full disabled:opacity-50"
              >
                Устгах
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
