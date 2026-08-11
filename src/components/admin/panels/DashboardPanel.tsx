"use client";

import Link from "next/link";
import type { DashboardStats } from "@/lib/db";
import { formatMnt } from "@/lib/price";

export default function DashboardPanel({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex flex-col gap-6">
      {/* The one thing that needs acting on, so it leads. A real link now that
          registrations is its own route, not a tab flip. */}
      {stats.pendingRegistrations > 0 && (
        <Link
          href="/admin/registrations"
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
        </Link>
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

export function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[1.05rem] font-extrabold mb-3">{title}</h2>
      <div className="grid grid-cols-2 nav:grid-cols-4 gap-3.5">{children}</div>
    </div>
  );
}

export function StatTile({
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
