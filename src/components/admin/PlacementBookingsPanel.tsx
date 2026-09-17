"use client";

import Link from "next/link";
import { useState } from "react";
import { apiError, readJson } from "@/lib/fetchJson";
import type { BookingStatus, PlacementBookingWithUser } from "@/lib/placementBookingDb";

/**
 * Танхимд ирж түвшин тогтоолгох цагийн жагсаалт — багш, эзэнд.
 *
 * Өдрөөр бүлэглэсэн: багшийн асуулт "маргааш хэн ирэх вэ?" болохоос
 * "энэ хүүхэд хэзээ ирэх вэ?" биш.
 */

const STATUS_LABEL: Record<BookingStatus, string> = {
  booked: "Хүлээгдэж байна",
  came: "Ирсэн",
  missed: "Ирээгүй",
  cancelled: "Болисон",
};

const STATUS_CLASS: Record<BookingStatus, string> = {
  booked: "bg-blue-soft text-blue-strong",
  came: "bg-green-soft/20 text-green",
  missed: "bg-red-soft/12 text-red-soft",
  cancelled: "bg-bg-soft text-ink-3",
};

/** "2026-09-22" → "09.22". */
const shortDate = (value: string) => value.slice(5).replace("-", ".");

export default function PlacementBookingsPanel({
  initialBookings,
}: {
  initialBookings: PlacementBookingWithUser[];
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = async (id: string, status: BookingStatus) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/placement-bookings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setError(apiError(res, json, "Тэмдэглэж чадсангүй"));
        return;
      }
      setBookings((list) => list.map((one) => (one.id === id ? { ...one, status } : one)));
    } catch {
      setError("Сүлжээний алдаа");
    } finally {
      setBusyId(null);
    }
  };

  if (bookings.length === 0) {
    return (
      <p className="text-ink-3 font-semibold text-[.9rem]">
        Одоогоор хэн ч түвшин тогтоох цаг захиалаагүй байна.
      </p>
    );
  }

  const dates = [...new Set(bookings.map((one) => one.bookedDate))].sort();

  return (
    <>
      {error && <p className="text-red-soft font-bold text-[.88rem] mb-3">{error}</p>}

      <div className="flex flex-col gap-6">
        {dates.map((date) => {
          const ofDay = bookings.filter((one) => one.bookedDate === date);
          return (
            <div key={date}>
              <h4 className="font-extrabold text-[.86rem] text-ink-3 uppercase tracking-wide mb-1">
                {shortDate(date)} · {ofDay.length} хүн
              </h4>
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
    </>
  );
}
