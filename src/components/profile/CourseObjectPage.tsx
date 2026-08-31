"use client";

import { useState } from "react";
import Link from "next/link";
import FreeExamBox, { type FreeExam } from "@/components/profile/FreeExamBox";
import LessonSchedule, { LessonModeTag } from "@/components/profile/LessonSchedule";
import {
  IconArrowLeft,
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconDocument,
  IconFacebook,
  IconPlayBox,
  IconTarget,
  IconTrophy,
} from "@/components/icons";
import type { RegistrationWithGroup } from "@/lib/db";
import type { AssessmentStatus } from "@/lib/assessment/types";
import type { AttendanceOutcome, AttendanceSummary } from "@/lib/courseAttendance";
import { PRESENT_THRESHOLD_PERCENT } from "@/lib/courseAttendance";
import { formatCourseDate } from "@/lib/courseDate";

export type CourseTab = "schedule" | "attendance" | "assessment" | "olympiad" | "contract";

type PastAssessment = {
  id: string;
  title: string;
  status: AssessmentStatus;
  createdAt: string;
};

const TABS: { key: CourseTab; label: string }[] = [
  { key: "schedule", label: "Хичээлийн хуваарь" },
  { key: "attendance", label: "Ирц" },
  { key: "assessment", label: "Түвшин тогтоох" },
  { key: "olympiad", label: "Мини олимпиад" },
  { key: "contract", label: "Гэрээ" },
];

/** Яг ижил урттай хөтөлбөрүүд ялгарахгүй тул жилийнхийг тэмдэглэнэ. */
function isYearly(programId: string): boolean {
  return programId.startsWith("program-");
}

export default function CourseObjectPage({
  registration,
  summary,
  initialTab,
  freeExam,
  assessments,
}: {
  registration: RegistrationWithGroup;
  summary: AttendanceSummary;
  initialTab: CourseTab;
  freeExam: FreeExam | null;
  assessments: PastAssessment[];
}) {
  const [tab, setTab] = useState<CourseTab>(initialTab);

  // Таб солиход хаяг нь мөрдөнө: сурагч хуудсаа шинэчлэхэд эсвэл линкээ
  // хуваалцахад тэр таб дээрээ л буцаж ирнэ. router.replace ашиглавал
  // сервер хуудас дахин дуудагдах тул түүхийг шууд бичнэ.
  function selectTab(next: CourseTab) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  return (
    <>
      <CourseHeader registration={registration} summary={summary} />

      <section className="pt-6 pb-[clamp(48px,7vw,96px)]">
        <div className="wrap max-w-[900px] mx-auto">
          <div
            role="tablist"
            aria-label="Сургалтын мэдээлэл"
            className="flex gap-1.5 overflow-x-auto border-b border-line -mx-1 px-1 pb-px"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => selectTab(t.key)}
                className={`shrink-0 font-extrabold text-[.88rem] px-4 py-3 border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? "text-blue-strong border-blue"
                    : "text-ink-3 border-transparent hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="pt-5">
            {tab === "schedule" && <ScheduleTab registration={registration} />}
            {tab === "attendance" && <AttendanceTab summary={summary} />}
            {tab === "assessment" && (
              <AssessmentTab freeExam={freeExam} assessments={assessments} />
            )}
            {tab === "olympiad" && <OlympiadTab />}
            {tab === "contract" && <ContractTab />}
          </div>
        </div>
      </section>
    </>
  );
}

/** Гарчиг: сургалт нь юу вэ, ирц нь ямар байна вэ — нэг харцаар. */
function CourseHeader({
  registration,
  summary,
}: {
  registration: RegistrationWithGroup;
  summary: AttendanceSummary;
}) {
  const judged = summary.present + summary.partial + summary.absent;

  return (
    <section className="relative">
      <div className="relative overflow-hidden bg-[radial-gradient(60%_120%_at_88%_60%,rgba(253,194,1,.5),transparent_60%),radial-gradient(50%_100%_at_15%_10%,rgba(14,95,196,.7),transparent_60%),linear-gradient(120deg,var(--color-navy-deep)_0%,var(--color-navy)_45%,var(--color-blue-strong)_100%)] pt-6 pb-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[length:22px_22px] opacity-60 [mask-image:linear-gradient(180deg,#000,transparent_75%)]" />
        <div className="wrap max-w-[900px] mx-auto relative z-[2]">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-white/80 font-bold text-[.85rem] hover:text-white"
          >
            <IconArrowLeft className="w-4 h-4" /> Профайл руу буцах
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap mt-3">
            <div className="min-w-0">
              {isYearly(registration.programId) && (
                <span className="inline-flex items-center text-[.7rem] font-extrabold tracking-[.06em] uppercase text-gold bg-white/10 px-2.5 py-1 rounded-full mb-2">
                  1 жилийн хөтөлбөр
                </span>
              )}
              <h1 className="text-white font-extrabold text-[clamp(1.35rem,2.6vw,1.9rem)] leading-[1.2]">
                {registration.programLabel}
              </h1>
              <p className="text-navy-ink-2 font-semibold text-[.88rem] mt-1.5">
                {registration.price}
                {registration.startDate && ` · Эхэлсэн: ${formatCourseDate(registration.startDate)}`}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-white/15 px-3 py-1.5 rounded-full shrink-0">
              <IconCheckCircle className="w-3.5 h-3.5" /> Идэвхтэй
            </span>
          </div>
        </div>
      </div>

      {/* KPI-ууд гарчгийн доор давхарлан суудаг — ирц нь энэ хуудасны
          гол тоо тул табаас үл хамааран үргэлж харагдана. */}
      <div className="wrap max-w-[900px] mx-auto relative z-[3] -mt-14">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Kpi label="Нийт хичээл" value={summary.lessons.length} />
          <Kpi label="Ирсэн" value={summary.present} tone="green" />
          <Kpi label="Дутуу суусан" value={summary.partial} tone="gold" />
          <Kpi
            label="Ирцийн хувь"
            value={summary.rate === null ? "—" : `${summary.rate}%`}
            hint={judged > 0 ? `${judged} хичээлээс` : "Тооцох хичээл алга"}
          />
        </div>
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "green" | "gold";
}) {
  const toneClass =
    tone === "green" ? "text-green" : tone === "gold" ? "text-gold-strong" : "text-ink";
  return (
    <div className="bg-surface border border-line rounded-md shadow-xs px-4 py-3.5">
      <span className="block text-[.72rem] font-extrabold tracking-[.04em] uppercase text-ink-3">
        {label}
      </span>
      <b className={`block font-extrabold text-[1.5rem] leading-tight mt-0.5 ${toneClass}`}>
        {value}
      </b>
      {hint && <span className="block text-[.72rem] font-semibold text-ink-3">{hint}</span>}
    </div>
  );
}

function ScheduleTab({ registration }: { registration: RegistrationWithGroup }) {
  return (
    <div className="flex flex-col gap-3">
      {registration.facebookGroup ? (
        <a
          href={registration.facebookGroup}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 bg-blue-soft text-blue-strong font-bold text-[.9rem] rounded-sm px-4 py-3"
        >
          <IconFacebook className="w-[18px] h-[18px] shrink-0" /> Facebook группт нэгдэх
        </a>
      ) : (
        <div className="flex items-center gap-2.5 bg-bg-soft text-ink-2 font-bold text-[.9rem] rounded-sm px-4 py-3">
          <IconFacebook className="w-[18px] h-[18px] shrink-0 text-ink-3" /> Facebook групп тун
          удахгүй
        </div>
      )}
      <LessonSchedule registration={registration} />
    </div>
  );
}

const OUTCOME: Record<AttendanceOutcome, { label: string; className: string }> = {
  present: { label: "Ирсэн", className: "text-green bg-green-soft" },
  partial: { label: "Дутуу суусан", className: "text-gold-strong bg-gold-soft" },
  absent: { label: "Тасалсан", className: "text-red-soft bg-red-soft/10" },
  unmarked: { label: "Бүртгэгдээгүй", className: "text-ink-3 bg-bg-soft" },
  upcoming: { label: "Болоогүй", className: "text-ink-3 bg-bg-soft" },
};

function AttendanceTab({ summary }: { summary: AttendanceSummary }) {
  // Болоогүй хичээлийг ирцийн жагсаалтад тавих нь утгагүй — доор нь
  // хэдэн хичээл үлдсэнийг л хэлнэ.
  const done = summary.lessons.filter((l) => l.outcome !== "upcoming");

  if (summary.lessons.length === 0) {
    return <Empty icon={<IconCalendar className="w-6 h-6" />} text="Хуваарь хараахан ороогүй байна." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[.82rem] font-semibold text-ink-3 bg-bg-soft border border-line rounded-sm px-4 py-3 leading-[1.6]">
        Онлайн хичээлийн ирцийг Zoom-д суусан хугацаагаар тооцно: хичээлийн{" "}
        {PRESENT_THRESHOLD_PERCENT}%-аас дээшийг сууссан бол{" "}
        <b className="text-green">ирсэн</b>, түүнээс бага бол{" "}
        <b className="text-gold-strong">дутуу суусан</b> гэж бүртгэнэ. Танхимын хичээлийн ирцийг
        багш өөрөө бүртгэнэ.
      </p>

      {done.length === 0 ? (
        <Empty
          icon={<IconClock className="w-6 h-6" />}
          text="Болж өнгөрсөн хичээл хараахан алга байна."
        />
      ) : (
        <div className="bg-surface border border-line rounded-md shadow-xs divide-y divide-line">
          {done.map((l) => {
            const badge = OUTCOME[l.outcome];
            return (
              <div key={l.lessonIndex} className="flex gap-3 px-4 py-3.5">
                <span className="w-6 h-6 rounded-md grid place-items-center font-extrabold text-[.72rem] shrink-0 mt-0.5 bg-bg-soft text-ink-2 border border-line-2">
                  {l.lessonIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[.88rem] text-ink">{l.topic}</span>
                    <LessonModeTag mode={l.mode} />
                  </span>
                  <div className="flex items-center justify-between gap-3 flex-wrap mt-1">
                    <span className="text-[.78rem] font-semibold text-ink-3">
                      {l.dateLabel}
                      {l.dateLabel && l.timeLabel && " · "}
                      {l.timeLabel}
                    </span>
                    <span className="flex items-center gap-1.5 flex-wrap justify-end">
                      {/* Бичлэгээр нөхсөн хүүхэд таслагч мэт харагдах ёсгүй. */}
                      {l.watchedRecording && (
                        <span className="inline-flex items-center gap-1 text-[.72rem] font-extrabold text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
                          <IconPlayBox className="w-3 h-3" /> Бичлэг үзсэн
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center text-[.75rem] font-extrabold px-2.5 py-1 rounded-full ${badge.className}`}
                      >
                        {badge.label}
                        {l.mode === "online" && l.percent !== undefined && l.outcome !== "absent"
                          ? ` · ${l.percent}%`
                          : ""}
                      </span>
                    </span>
                  </div>
                  {l.mode === "online" && l.minutes !== undefined && l.minutes > 0 && (
                    <span className="block text-[.72rem] font-semibold text-ink-3 mt-1">
                      {`Zoom дээр ${l.minutes} минут суусан`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {summary.upcoming > 0 && (
        <p className="text-[.82rem] font-semibold text-ink-3 text-center">
          Цаашид {summary.upcoming} хичээл байна.
        </p>
      )}
    </div>
  );
}

const ASSESSMENT_STATUS: Record<AssessmentStatus, string> = {
  awaiting_payment: "Төлбөр хүлээгдэж буй",
  paid: "Эхлээгүй",
  questionnaire_done: "Бодож байгаа",
  problems_submitted: "Багшид хүрсэн",
  grading: "Багш шалгаж байна",
  completed: "Дүгнэлт гарсан",
  cancelled: "Цуцлагдсан",
};

function AssessmentTab({
  freeExam,
  assessments,
}: {
  freeExam: FreeExam | null;
  assessments: PastAssessment[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {freeExam ? (
        <FreeExamBox exam={freeExam} />
      ) : (
        <Empty
          icon={<IconTarget className="w-6 h-6" />}
          text="Энэ сургалтад одоогоор нээлттэй түвшин тогтоох шалгалт алга байна."
        />
      )}

      {assessments.length > 0 && (
        <div className="bg-surface border border-line rounded-md shadow-xs">
          <b className="block font-extrabold text-[.9rem] px-4 pt-4 pb-2">Миний өгсөн шалгалтууд</b>
          <div className="divide-y divide-line">
            {assessments.map((a) => (
              <Link
                key={a.id}
                href={`/profile/assessment?a=${a.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-soft"
              >
                <span className="min-w-0">
                  <b className="block font-bold text-[.88rem] text-ink truncate">{a.title}</b>
                  <span className="text-[.76rem] font-semibold text-ink-3">
                    {formatCourseDate(a.createdAt.slice(0, 10))}
                  </span>
                </span>
                <span
                  className={`shrink-0 inline-flex items-center text-[.75rem] font-extrabold px-2.5 py-1 rounded-full ${
                    a.status === "completed"
                      ? "text-green bg-green-soft"
                      : "text-ink-3 bg-bg-soft"
                  }`}
                >
                  {ASSESSMENT_STATUS[a.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OlympiadTab() {
  return (
    <Soon
      icon={<IconTrophy className="w-7 h-7" />}
      title="Мини олимпиад тун удахгүй"
      text="Сар бүрийн эцэст зохион байгуулагдах мини олимпиадын бодлого, оноо, байр эндээс харагдана."
    />
  );
}

function ContractTab() {
  return (
    <Soon
      icon={<IconDocument className="w-7 h-7" />}
      title="Гэрээ тун удахгүй"
      text="Сургалтын гэрээг системээр байгуулж, эндээс уншиж, цахимаар баталгаажуулдаг болно."
    />
  );
}

function Soon({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-12 text-center">
      <span className="inline-grid place-items-center w-14 h-14 rounded-full bg-bg-soft text-ink-3">
        {icon}
      </span>
      <b className="block font-extrabold text-[1.05rem] mt-3">{title}</b>
      <p className="text-ink-2 font-medium text-[.9rem] mt-1.5 max-w-[46ch] mx-auto leading-[1.6]">
        {text}
      </p>
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 bg-bg-soft border border-line rounded-sm px-4 py-5 text-ink-2">
      <span className="shrink-0 text-ink-3">{icon}</span>
      <span className="font-semibold text-[.9rem]">{text}</span>
    </div>
  );
}
