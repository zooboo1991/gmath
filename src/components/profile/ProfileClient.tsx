"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import FormField from "@/components/FormField";
import type { PublicUser, RegistrationWithGroup } from "@/lib/db";
import {
  IconCheckCircle,
  IconClock,
  IconFacebook,
  IconPerson,
  IconPencil,
  IconClose,
  IconVideoCamera,
  IconPlay,
} from "@/components/icons";
import { getLessonStates, getLessonStatus, type LessonWithState } from "@/lib/lessonSchedule";

type Tab = "active" | "pending";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfileClient({
  user: initialUser,
  registrations,
}: {
  user: PublicUser;
  registrations: RegistrationWithGroup[];
}) {
  const [user, setUser] = useState(initialUser);
  const [tab, setTab] = useState<Tab>("active");
  const [showEdit, setShowEdit] = useState(false);

  const active = registrations.filter((r) => r.status === "active");
  const pending = registrations.filter((r) => r.status !== "active");
  const list = tab === "active" ? active : pending;

  return (
    <>
      <section className="relative">
        <div className="relative h-[130px] sm:h-[160px] overflow-hidden bg-[radial-gradient(60%_120%_at_88%_60%,rgba(253,194,1,.65),transparent_60%),radial-gradient(50%_100%_at_15%_10%,rgba(14,95,196,.7),transparent_60%),linear-gradient(120deg,var(--color-navy-deep)_0%,var(--color-navy)_45%,var(--color-blue-strong)_100%)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[length:22px_22px] opacity-60 [mask-image:linear-gradient(180deg,#000,transparent_75%)]" />
        </div>
        <div className="wrap">
          <div className="relative -mt-12 sm:-mt-14 pb-7">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-surface border-[4px] border-surface shadow-[0_0_0_3px_rgba(253,194,1,.3),0_10px_24px_-8px_rgba(11,61,120,.45)] grid place-items-center shrink-0">
              <IconPerson className="w-11 h-11 sm:w-12 sm:h-12 text-ink-3" />
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap mt-4">
              <div>
                <h1 className="text-[1.4rem] sm:text-[1.6rem] font-extrabold">
                  {user.lastName} {user.firstName}
                </h1>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <Pill>{user.role === "teacher" ? "Багш" : "Сурагч"}</Pill>
                  <Pill>
                    {user.school}
                    {user.grade ? ` · ${user.grade}` : ""}
                  </Pill>
                  <Pill>{user.phone}</Pill>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEdit(true)}
                className="btn-ring inline-flex items-center gap-2 font-extrabold text-[.9rem] rounded-full bg-surface px-5 py-3 transition-colors hover:text-blue-strong shrink-0"
              >
                <IconPencil className="w-4 h-4" /> Профайл засах
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap border-b border-line">
        <div className="flex gap-7">
          <TabButton active={tab === "active"} onClick={() => setTab("active")}>
            Идэвхтэй сургалт{active.length > 0 && ` (${active.length})`}
          </TabButton>
          <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
            Өмнөх сургалт{pending.length > 0 && ` (${pending.length})`}
          </TabButton>
        </div>
      </div>

      <section className="section-pad">
        <div className="wrap max-w-[760px] mx-auto">
          {list.length === 0 ? (
            <p className="text-ink-2 font-medium bg-bg-soft border border-line rounded-md px-6 py-8 text-center">
              {tab === "active" ? "Идэвхтэй сургалт алга байна." : "Өмнөх сургалт алга байна."}{" "}
              <Link href="/courses" className="text-blue-strong font-bold">
                Сургалтууд үзэх →
              </Link>
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {list.map((r) => (
                <div key={r.id} className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <b className="font-extrabold text-[1.05rem] block">{r.programLabel}</b>
                      <span className="text-ink-3 font-semibold text-[.85rem]">{r.price}</span>
                    </div>
                    {r.status === "active" ? (
                      <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
                        <IconCheckCircle className="w-3.5 h-3.5" /> Идэвхтэй
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-gold-strong bg-gold-soft px-3 py-1.5 rounded-full">
                        <IconClock className="w-3.5 h-3.5" /> Хүлээгдэж буй
                      </span>
                    )}
                  </div>

                  {r.status === "active" ? (
                    <div className="mt-4 pt-4 border-t border-line flex flex-col gap-3">
                      <ZoomJoin registration={r} />
                      {r.facebookGroup ? (
                        <a
                          href={r.facebookGroup}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2.5 bg-blue-soft text-blue-strong font-bold text-[.9rem] rounded-sm px-4 py-3"
                        >
                          <IconFacebook className="w-[18px] h-[18px] shrink-0" /> Facebook группт нэгдэх
                        </a>
                      ) : (
                        <div className="flex items-center gap-2.5 bg-bg-soft text-ink-2 font-bold text-[.9rem] rounded-sm px-4 py-3">
                          <IconFacebook className="w-[18px] h-[18px] shrink-0 text-ink-3" /> Facebook групп тун удахгүй
                        </div>
                      )}
                      <LessonSchedule registration={r} />
                    </div>
                  ) : (
                    <p className="mt-3 text-[.88rem] text-ink-3 font-semibold">
                      Админ төлбөрийг баталгаажуулсны дараа энд Facebook групп, хуваарийн холбоос
                      гарч ирнэ.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {showEdit && (
        <EditProfileModal
          user={user}
          onClose={() => setShowEdit(false)}
          onSaved={(u) => {
            setUser(u);
            setShowEdit(false);
          }}
        />
      )}
    </>
  );
}

/**
 * The Zoom room for a paid-up course. The live/next calculation runs here, in
 * the browser, so it uses the student's own clock rather than the server's UTC.
 */
const TICK_MS = 30_000;

/**
 * The wall clock as an external store: null while rendering on the server (so
 * hydration matches), then ticking every half minute so a student who leaves
 * the page open sees the button go live when the lesson actually starts.
 */
function useNow(): Date | null {
  const tick = useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, TICK_MS);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / TICK_MS),
    () => null
  );
  return tick === null ? null : new Date();
}

function ZoomJoin({ registration }: { registration: RegistrationWithGroup }) {
  const now = useNow();

  if (!registration.zoomLink) return null;

  const status = now ? getLessonStatus(registration.lessons, now) : null;
  const isLive = Boolean(status?.live);

  return (
    <div
      className={`rounded-sm px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap ${
        isLive ? "bg-green-soft" : "bg-bg-soft"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <IconVideoCamera className={`w-[18px] h-[18px] shrink-0 ${isLive ? "text-green" : "text-ink-3"}`} />
          <b className="font-extrabold text-[.95rem]">
            {isLive ? "Хичээл эхэлж байна" : "Zoom хичээл"}
          </b>
        </div>
        <span className="block text-[.84rem] font-semibold text-ink-3 mt-1">
          {isLive
            ? status?.live?.topic
            : status?.nextLabel
              ? `Дараагийн хичээл: ${status.nextLabel}`
              : "Хуваарь удахгүй зарлагдана"}
        </span>
        {(registration.zoomMeetingId || registration.zoomPasscode) && (
          <span className="block text-[.78rem] font-semibold text-ink-3 mt-1.5">
            {registration.zoomMeetingId && `ID: ${registration.zoomMeetingId}`}
            {registration.zoomMeetingId && registration.zoomPasscode && " · "}
            {registration.zoomPasscode && `Код: ${registration.zoomPasscode}`}
          </span>
        )}
      </div>
      {/* Deliberately never disabled: a student may join late, or the teacher
          may open the room outside the published schedule. */}
      <a
        href={registration.zoomLink}
        target="_blank"
        rel="noreferrer"
        className={`shrink-0 font-extrabold rounded-full px-6 py-3 text-[.92rem] transition-transform hover:-translate-y-0.5 ${
          isLive ? "bg-green text-white" : "bg-blue text-white shadow-blue"
        }`}
      >
        Хичээлд орох →
      </a>
    </div>
  );
}

/**
 * The course's lessons, each offering exactly what is useful at that moment:
 * a recording once the lesson is over, the room while it is on, and nothing at
 * all for lessons that have not come round yet.
 */
function LessonSchedule({ registration }: { registration: RegistrationWithGroup }) {
  const now = useNow();
  const lessons = registration.lessons ?? [];

  if (lessons.length === 0) {
    return (
      <div className="flex items-center gap-2.5 bg-bg-soft text-ink-2 font-bold text-[.9rem] rounded-sm px-4 py-3">
        <IconClock className="w-[18px] h-[18px] shrink-0 text-ink-3" /> Хуваарь тун удахгүй
      </div>
    );
  }

  // Until hydration `now` is null, so every row renders in its neutral state
  // and the server and client markup match.
  const states = now ? getLessonStates(lessons, now) : null;

  return (
    <div className="bg-bg-soft rounded-sm px-4 py-3.5">
      <b className="font-extrabold text-[.9rem] block mb-2.5">Хичээлийн хуваарь ({lessons.length})</b>
      <div className="flex flex-col">
        {lessons.map((lesson, i) => {
          const info = states?.[i];
          return (
            // The topic gets the full row width; the date and the action share
            // the line below it, so nothing has to be truncated on a phone.
            <div key={i} className="flex gap-3 py-2.5 border-b border-line last:border-0">
              <span
                className={`w-6 h-6 rounded-md grid place-items-center font-extrabold text-[.72rem] shrink-0 mt-0.5 ${
                  info?.state === "live"
                    ? "bg-green text-white"
                    : "bg-surface text-ink-2 border border-line-2"
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block font-bold text-[.88rem] text-ink">{lesson.topic}</span>
                <div className="flex items-center justify-between gap-3 flex-wrap mt-1">
                  <span className="text-[.78rem] font-semibold text-ink-3">
                    {info?.dateLabel}
                    {info?.dateLabel && info?.timeLabel && " · "}
                    {info?.timeLabel}
                  </span>
                  <LessonAction info={info} courseZoomLink={registration.zoomLink} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LessonAction({
  info,
  courseZoomLink,
}: {
  info: LessonWithState | undefined;
  courseZoomLink?: string;
}) {
  if (!info) return null;

  if (info.state === "past") {
    return info.lesson.recordingLink ? (
      <a
        href={info.lesson.recordingLink}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 inline-flex items-center gap-1.5 font-extrabold text-[.8rem] text-blue-strong bg-blue-soft rounded-full px-3.5 py-2"
      >
        <IconPlay className="w-3 h-3" /> Бичлэг үзэх
      </a>
    ) : (
      <span className="shrink-0 font-bold text-[.78rem] text-ink-3">Бичлэг удахгүй</span>
    );
  }

  if (info.state === "live") {
    // A lesson may override the course's room; otherwise the course link is
    // the one recurring meeting they all share.
    const href = info.lesson.zoomLink || courseZoomLink;
    if (!href) return null;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 inline-flex items-center gap-1.5 font-extrabold text-[.8rem] text-white bg-green rounded-full px-3.5 py-2"
      >
        <IconVideoCamera className="w-3.5 h-3.5" /> Хичээлд орох
      </a>
    );
  }

  // Upcoming and undated lessons deliberately carry no link.
  return null;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[.82rem] font-bold text-ink-2 bg-bg-soft border border-line rounded-full px-3.5 py-1.5">
      {children}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-4 font-extrabold text-[.95rem] border-b-2 transition-colors ${
        active ? "border-blue text-blue-strong" : "border-transparent text-ink-3 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

type EditFields = {
  lastName: string;
  firstName: string;
  school: string;
  grade: string;
  email: string;
  facebook: string;
  zoom: string;
};

function EditProfileModal({
  user,
  onClose,
  onSaved,
}: {
  user: PublicUser;
  onClose: () => void;
  onSaved: (user: PublicUser) => void;
}) {
  const [fields, setFields] = useState<EditFields>({
    lastName: user.lastName,
    firstName: user.firstName,
    school: user.school,
    grade: user.grade ?? "",
    email: user.email,
    facebook: user.facebook ?? "",
    zoom: user.zoom ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EditFields, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setField = (name: keyof EditFields, value: string) => {
    setFields((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const validate = () => {
    const next: Partial<Record<keyof EditFields, boolean>> = {};
    if (!fields.lastName.trim()) next.lastName = true;
    if (!fields.firstName.trim()) next.firstName = true;
    if (!fields.school.trim()) next.school = true;
    if (user.role === "student" && !fields.grade.trim()) next.grade = true;
    if (!EMAIL_RE.test(fields.email.trim())) next.email = true;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.errors) setErrors((e) => ({ ...e, ...json.errors }));
        setSubmitError("Хадгалахад алдаа гарлаа. Дахин оролдоно уу.");
        return;
      }
      onSaved(json.user);
    } catch {
      setSubmitError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[rgba(15,20,40,.6)] backdrop-blur-[3px] flex items-center justify-center z-[200] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface rounded-lg w-full max-w-[520px] max-h-[88vh] overflow-y-auto shadow-lg px-[30px] py-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[1.3rem] font-extrabold">Профайл засах</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            className="w-9 h-9 rounded-full bg-bg-soft grid place-items-center shrink-0"
          >
            <IconClose className="w-4 h-4 text-ink-2" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
          <FormField label="Овог" required error={errors.lastName ? "e" : undefined}>
            <input value={fields.lastName} onChange={(e) => setField("lastName", e.target.value)} />
          </FormField>
          <FormField label="Нэр" required error={errors.firstName ? "e" : undefined}>
            <input value={fields.firstName} onChange={(e) => setField("firstName", e.target.value)} />
          </FormField>
        </div>
        <FormField
          label={user.role === "teacher" ? "Ажилладаг сургууль" : "Сурдаг сургууль"}
          required
          error={errors.school ? "e" : undefined}
        >
          <input value={fields.school} onChange={(e) => setField("school", e.target.value)} />
        </FormField>
        {user.role === "student" && (
          <FormField label="Анги" required error={errors.grade ? "e" : undefined}>
            <input
              value={fields.grade}
              onChange={(e) => setField("grade", e.target.value)}
              placeholder="Жишээ: 6-р анги"
            />
          </FormField>
        )}
        <FormField label="Имэйл хаяг" required error={errors.email ? "e" : undefined}>
          <input value={fields.email} onChange={(e) => setField("email", e.target.value)} />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
          <FormField label="Facebook аккаунт нэр">
            <input value={fields.facebook} onChange={(e) => setField("facebook", e.target.value)} />
          </FormField>
          <FormField label="Zoom аккаунт нэр">
            <input value={fields.zoom} onChange={(e) => setField("zoom", e.target.value)} />
          </FormField>
        </div>

        {submitError && <p className="text-[.85rem] font-semibold text-red-soft mb-3">{submitError}</p>}

        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="w-full font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 mt-1.5 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {submitting ? "Хадгалж байна…" : "Хадгалах"}
        </button>
      </div>
    </div>
  );
}
