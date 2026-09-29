"use client";

import Link from "next/link";
import { useState } from "react";
import { apiError, readJson } from "@/lib/fetchJson";
import { meetingDayLabel, meetingSlots } from "@/lib/parentMeeting";
import type { MeetingStatus, ParentMeetingWithUser } from "@/lib/parentMeetingDb";

/**
 * Багштай хийх уулзалтын жагсаалт — багш, эзэнд.
 *
 * Хоёр ажилтай: нээлттэй өдрүүдээ удирдах (энд байхгүй өдөр сурагчдад
 * харагдахгүй) ба хэн хэдэн цагт ирэхийг өдрөөр нь харах.
 */

const STATUS_LABEL: Record<MeetingStatus, string> = {
  booked: "Хүлээгдэж байна",
  came: "Ирсэн",
  missed: "Ирээгүй",
  cancelled: "Болисон",
};

const STATUS_CLASS: Record<MeetingStatus, string> = {
  booked: "bg-blue-soft text-blue-strong",
  came: "bg-green-soft/20 text-green",
  missed: "bg-red-soft/12 text-red-soft",
  cancelled: "bg-bg-soft text-ink-3",
};

const TOTAL_SLOTS = meetingSlots().length;

export default function ParentMeetingsPanel({
  initialMeetings,
  initialDays,
  today,
  zoomError = false,
}: {
  initialMeetings: ParentMeetingWithUser[];
  initialDays: string[];
  /** Серверийн өнөөдөр (УБ) — өнгөрсөн өдрийг ялгахад. */
  today: string;
  /** "Zoom өрөө нээх" амжилтгүй болж буцаж ирсэн. */
  zoomError?: boolean;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [days, setDays] = useState(initialDays);
  const [newDate, setNewDate] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    zoomError ? "Zoom өрөөг нээж чадсангүй. Zoom-ын тохиргоог шалгаад дахин оролдоно уу." : null
  );

  const changeDays = async (method: "POST" | "DELETE", date: string) => {
    setBusyId(date);
    setError(null);
    try {
      const res = await fetch("/api/admin/parent-meeting-days", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setError(apiError(res, json, "Өдрийг өөрчилж чадсангүй"));
        return;
      }
      setDays((json as { days: string[] }).days ?? []);
      if (method === "POST") setNewDate("");
    } catch {
      setError("Сүлжээний алдаа");
    } finally {
      setBusyId(null);
    }
  };

  const mark = async (id: string, status: MeetingStatus) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/parent-meetings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setError(apiError(res, json, "Тэмдэглэж чадсангүй"));
        return;
      }
      setMeetings((list) => list.map((one) => (one.id === id ? { ...one, status } : one)));
    } catch {
      setError("Сүлжээний алдаа");
    } finally {
      setBusyId(null);
    }
  };

  const dates = [...new Set(meetings.map((one) => one.meetingDate))].sort();

  return (
    <>
      {error && <p className="text-red-soft font-bold text-[.88rem] mb-3">{error}</p>}

      <section className="bg-surface border border-line rounded-md px-5 py-4 mb-7">
        <h3 className="font-extrabold text-[1rem]">Нээлттэй өдрүүд</h3>
        <p className="text-ink-3 font-semibold text-[.84rem] mt-1 leading-[1.6]">
          Энд байхгүй өдөр сурагчдад огт харагдахгүй. Өдөр бүр {TOTAL_SLOTS} цагтай.
          Өдрийг хаахад аль хэдийн захиалсан цагууд хэвээрээ үлдэнэ.
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-3.5">
          <input
            type="date"
            value={newDate}
            min={today}
            onChange={(e) => setNewDate(e.target.value)}
            className="h-10 px-3 rounded-md border border-line font-bold text-[.9rem]"
          />
          <button
            type="button"
            disabled={!newDate || busyId === newDate}
            onClick={() => changeDays("POST", newDate)}
            className="h-10 px-4 rounded-md bg-blue text-white font-extrabold text-[.88rem] disabled:opacity-50"
          >
            Өдөр нээх
          </button>
        </div>

        {days.length === 0 ? (
          <p className="text-ink-3 font-semibold text-[.88rem] mt-3">Нээлттэй өдөр алга байна.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-3.5">
            {days.map((date) => {
              const booked = meetings.filter((one) => one.meetingDate === date).length;
              const past = date < today;
              return (
                <span
                  key={date}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[.84rem] font-extrabold ${
                    past ? "border-line text-ink-3" : "border-blue-soft-2 text-ink"
                  }`}
                >
                  {meetingDayLabel(date)}
                  <span className="font-bold text-ink-3 tabular-nums">
                    {booked}/{TOTAL_SLOTS}
                  </span>
                  <button
                    type="button"
                    disabled={busyId === date}
                    onClick={() => changeDays("DELETE", date)}
                    aria-label={`${date} өдрийг хаах`}
                    className="text-ink-3 hover:text-red-soft disabled:opacity-50"
                  >
                    ✕
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </section>

      {meetings.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem]">
          Одоогоор хэн ч уулзалтын цаг захиалаагүй байна.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {dates.map((date) => {
            const ofDay = meetings.filter((one) => one.meetingDate === date);
            return (
              <div key={date}>
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h4 className="font-extrabold text-[.86rem] text-ink-3 uppercase tracking-wide">
                    {meetingDayLabel(date)} · {ofDay.length} уулзалт
                    {ofDay.some((one) => one.mode === "online") &&
                      ` (${ofDay.filter((one) => one.mode === "online").length} онлайн)`}
                  </h4>
                  {/* Өдрийн нэг Zoom өрөө: өглөө нээгээд өдөржин тэндээ байна.
                      Хүлээлгийн өрөө асаалттай үүсдэг тул гэр бүлийг нэг
                      нэгээр нь оруулна. */}
                  {ofDay.some((one) => one.mode === "online") && (
                    <a
                      href={`/api/admin/parent-meetings/room?date=${date}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[.8rem] font-extrabold text-blue-strong border border-blue-soft-2 rounded-full px-3 py-1 hover:bg-blue-soft"
                    >
                      Zoom өрөө нээх →
                    </a>
                  )}
                </div>
                <div className="divide-y divide-line">
                  {ofDay.map((one) => (
                    <div key={one.id} className="flex items-center gap-3 py-3 flex-wrap">
                      <span className="w-[104px] shrink-0 font-extrabold text-[.9rem] tabular-nums">
                        {one.slot}
                      </span>
                      <div className="flex-1 min-w-[180px]">
                        {one.user ? (
                          <Link
                            href={`/admin/users/${one.user.id}`}
                            className="font-extrabold text-[.92rem] block hover:text-blue-strong hover:underline"
                          >
                            {[one.user.lastName, one.user.firstName].filter(Boolean).join(" ") ||
                              "Нэр тодорхойгүй"}
                          </Link>
                        ) : (
                          <b className="font-extrabold text-[.92rem] block">Хэрэглэгч устсан</b>
                        )}
                        <span className="text-[.82rem] font-semibold text-ink-3">
                          {[one.user?.phone, one.user?.grade].filter(Boolean).join(" · ") || "—"}
                        </span>
                        {one.note && (
                          <span className="block text-[.82rem] text-ink-2 font-medium mt-1">
                            {one.note}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[.76rem] font-extrabold px-2.5 py-1 rounded-full ${
                          one.mode === "online" ? "bg-blue-soft text-blue-strong" : "bg-bg-soft text-ink-2"
                        }`}
                      >
                        {one.mode === "online" ? "Онлайн" : "Танхим"}
                      </span>
                      <span
                        className={`text-[.76rem] font-extrabold px-2.5 py-1 rounded-full ${STATUS_CLASS[one.status]}`}
                      >
                        {STATUS_LABEL[one.status]}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {one.status !== "came" && (
                          <button
                            type="button"
                            disabled={busyId === one.id}
                            onClick={() => mark(one.id, "came")}
                            className="h-8 px-3 rounded-md border border-line font-extrabold text-[.8rem] disabled:opacity-50"
                          >
                            Ирсэн
                          </button>
                        )}
                        {one.status !== "missed" && (
                          <button
                            type="button"
                            disabled={busyId === one.id}
                            onClick={() => mark(one.id, "missed")}
                            className="h-8 px-3 rounded-md border border-line font-extrabold text-[.8rem] text-ink-3 disabled:opacity-50"
                          >
                            Ирээгүй
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
