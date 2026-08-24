"use client";

import Link from "next/link";
import type { DashboardStats } from "@/lib/db";
import type { OperationsSnapshot } from "@/lib/adminDashboard";
import { programAdminHref } from "@/lib/registration";
import { formatMnt } from "@/lib/price";

export default function DashboardPanel({
  stats,
  operations,
}: {
  stats: DashboardStats;
  operations: OperationsSnapshot;
}) {
  const { money } = stats;
  const paidPct = money.totalDue > 0 ? Math.round((money.paid / money.totalDue) * 100) : 0;
  const waiting = operations.assessment.waitingToGrade + operations.assessment.beingGraded;

  return (
    <div className="flex flex-col gap-6">
      {/* What needs a person today, before any counting. */}
      <div className="grid grid-cols-1 nav:grid-cols-3 gap-3.5">
        <ActionCard
          href="/admin/registrations"
          label="Баталгаажуулах төлбөр"
          count={stats.pendingRegistrations}
          note={`${formatMnt(money.pendingSeats)} хүлээгдэж байна`}
          quiet="Хүлээгдэж буй бүртгэл алга"
        />
        <ActionCard
          href="/admin/grading"
          label="Шалгах бодолт"
          count={waiting}
          note="Сурагчид дүгнэлт хүлээж байна"
          quiet="Шалгах бодолт алга"
        />
        <ActionCard
          href="/admin/chat"
          label="Хариу хүлээж буй чат"
          count={operations.support.openIssues}
          note="Сурагч, эцэг эх асуулт бичсэн"
          quiet="Хариулаагүй чат алга"
        />
      </div>

      {operations.todayLessons.length > 0 && (
        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
          <h3 className="font-extrabold text-[1rem] mb-3">Өнөөдрийн хичээл</h3>
          <div className="flex flex-col">
            {operations.todayLessons.map((lesson) => (
              <Link
                key={`${lesson.courseId}-${lesson.lessonIndex}`}
                href={programAdminHref(lesson.courseId)}
                className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0 hover:text-blue-strong"
              >
                <div className="min-w-0">
                  <b className="font-extrabold text-[.9rem] block truncate">{lesson.courseLabel}</b>
                  <span className="text-ink-3 font-semibold text-[.82rem] truncate block">
                    {lesson.timeLabel}
                    {lesson.topic ? ` · ${lesson.topic}` : ""}
                  </span>
                </div>
                <span className="shrink-0 flex items-center gap-2.5 text-[.8rem] font-extrabold">
                  {lesson.attended > 0 && <span className="text-green">Ирсэн {lesson.attended}</span>}
                  {lesson.hasZoom ? (
                    <span className="text-blue-strong">Zoom бэлэн</span>
                  ) : (
                    <span className="text-red-soft">Zoom алга</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Money, split the way the roster counts it. */}
      <div>
        <h2 className="text-[1.05rem] font-extrabold mb-3">Төлбөр</h2>
        <div className="grid grid-cols-2 nav:grid-cols-4 gap-3.5">
          <StatTile label="Нийт төлөгдөх" value={formatMnt(money.totalDue)} tone="blue" />
          <StatTile label="Төлөгдсөн" value={formatMnt(money.paid)} tone="green" />
          <StatTile label="Хүлээгдэж буй" value={formatMnt(money.outstanding)} tone="gold" />
          <StatTile label="Төлөлтийн явц" value={`${paidPct}%`} tone={paidPct >= 90 ? "green" : "gold"} />
        </div>
        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5 mt-3.5">
          <div className="h-2 rounded-sm bg-bg-soft overflow-hidden flex">
            <div className="h-full bg-green" style={{ width: `${paidPct}%` }} />
            <div className="h-full bg-gold" style={{ width: `${100 - paidPct}%` }} />
          </div>
          <div className="flex flex-col gap-1.5 mt-3.5">
            <BreakdownRow
              label="Хэсэгчлэн төлж буй сурагчдын үлдэгдэл"
              value={formatMnt(money.installmentBalance)}
            />
            <BreakdownRow
              label="Баталгаажаагүй бүртгэлийн дүн"
              value={formatMnt(money.pendingSeats)}
            />
          </div>
          {money.unsetAmountCount > 0 && (
            <p className="text-gold-strong font-bold text-[.82rem] mt-3 pt-3 border-t border-line">
              {money.unsetAmountCount} бүртгэлд төлөх дүн тохируулаагүй тул сургалтын үнээр нь,
              төлөгдөөгүйд тооцов. Бүртгэлийн жагсаалтаас дүнг нь оруулбал тоо нь яг болно.
            </p>
          )}
        </div>
      </div>

      <StatSection title="Түвшин тогтоох">
        <StatTile label="Шалгах хүлээж буй" value={operations.assessment.waitingToGrade} tone="gold" />
        <StatTile label="Шалгаж эхэлсэн" value={operations.assessment.beingGraded} tone="blue" />
        <StatTile label="Бодож байгаа сурагч" value={operations.assessment.solving} />
        <StatTile label="Дүгнэлт гарсан" value={operations.assessment.completed} tone="green" />
      </StatSection>

      <StatSection title="Хэрэглэгчид">
        <StatTile label="Нийт бүртгүүлсэн сурагч" value={stats.students} />
        <StatTile label="Хичээлд сууж байгаа сурагч" value={stats.studentsInClass} tone="green" />
        <StatTile label="Идэвхтэй бүртгэл" value={stats.activeRegistrations} tone="green" />
        <StatTile
          label="Багш"
          value={`${stats.teachers} / ${operations.staffAccounts} эрх`}
          tone="muted"
        />
      </StatSection>

      <StatSection title="Сургалт, контент">
        <StatTile label="Нийт сургалт" value={stats.courses} />
        <StatTile label="Нийтлэгдсэн" value={stats.coursesPublished} tone="green" />
        <StatTile label="Нээлттэй шалгалт" value={operations.assessment.openExams} tone="blue" />
        <StatTile label="Нийтлэл" value={stats.articles} />
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

/** One thing waiting on a person, or the quiet line that says nothing is. */
function ActionCard({
  href,
  label,
  count,
  note,
  quiet,
}: {
  href: string;
  label: string;
  count: number;
  note: string;
  quiet: string;
}) {
  if (count === 0) {
    return (
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
        <b className="font-extrabold text-[.9rem] block text-ink-3">{label}</b>
        <span className="text-ink-3 font-semibold text-[.85rem]">{quiet}</span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="bg-gold-soft border border-gold rounded-md px-5 py-4 flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <b className="font-extrabold text-[1.05rem] block">
          {label}: {count}
        </b>
        <span className="text-ink-2 font-semibold text-[.85rem] block truncate">{note}</span>
      </div>
      <span className="font-extrabold text-blue-strong text-[.9rem] shrink-0">→</span>
    </Link>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-2 font-semibold text-[.88rem]">{label}</span>
      <b className="font-extrabold text-[.88rem] tabular-nums shrink-0">{value}</b>
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
