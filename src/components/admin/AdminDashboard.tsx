"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { AnalyticsStats, Article, Certificate, Course, DashboardStats, PublicUser, Registration } from "@/lib/db";
import { IconCheckCircle, IconClock } from "@/components/icons";
import { formatCourseDate } from "@/lib/courseDate";
import { formatMnt } from "@/lib/price";

type RegistrationWithUser = Registration & { user?: PublicUser };
type Tab =
  | "dashboard"
  | "registrations"
  | "courses"
  | "articles"
  | "users"
  | "analytics"
  | "certificates"
  | "assessment";

export default function AdminDashboard({
  initialRegistrations,
  initialCourses,
  initialArticles,
  initialUsers,
  initialCertificates,
  assessmentFee,
  stats,
  analytics,
}: {
  initialRegistrations: RegistrationWithUser[];
  initialCourses: Course[];
  initialArticles: Article[];
  initialUsers: PublicUser[];
  initialCertificates: Certificate[];
  assessmentFee: string;
  stats: DashboardStats;
  analytics: AnalyticsStats;
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
        </div>

        {tab === "dashboard" && <DashboardPanel stats={stats} onOpenPending={() => setTab("registrations")} />}

        {tab === "assessment" && <AssessmentPanel initialFee={assessmentFee} />}

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
