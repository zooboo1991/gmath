"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Course, PublicUser, Registration, YearlyProgram } from "@/lib/db";
import { formatCourseDate } from "@/lib/courseDate";

type RegistrationWithUser = Registration & { user?: PublicUser };

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

/**
 * The courses tab as its own component: the archive/restore handlers and the
 * per-program registration counts used to live in the dashboard parent and
 * arrive as props — with the tab now a standalone route they move in here.
 */
export default function CoursesPanel({
  initialCourses,
  yearlyPrograms,
  registrations,
  viewCounts,
}: {
  initialCourses: Course[];
  yearlyPrograms: YearlyProgram[];
  registrations: RegistrationWithUser[];
  viewCounts: Record<string, number>;
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const upcoming = courses.filter((c) => c.kind === "upcoming" && c.status !== "archived");
  const vod = courses.filter((c) => c.kind === "vod" && c.status !== "archived");
  const archived = courses.filter((c) => c.status === "archived");

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
  );
}
