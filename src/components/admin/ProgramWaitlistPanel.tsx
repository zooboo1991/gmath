"use client";

import Link from "next/link";
import { useState } from "react";
import { apiError, readJson } from "@/lib/fetchJson";
import type {
  ProgramWaitlistEntryWithUser,
  ProgramWaitlistStatus,
} from "@/lib/programWaitlist";

/**
 * Хөтөлбөрийн хүлээлгийн дараалал — админд.
 *
 * Дугаар нь хадгалагдсан утга биш, дараалалаас тооцогдсон байр. Хэн нэгнийг
 * "холбогдсон" болгоход тэр байрыг эзлэхээ болих тул ардчуудынх нь дугаар
 * өөрөө урагшилна.
 */

const STATUS_LABEL: Record<ProgramWaitlistStatus, string> = {
  waiting: "Хүлээж байна",
  notified: "Холбогдсон",
  closed: "Хаасан",
};

export default function ProgramWaitlistPanel({
  initialEntries,
  canEdit,
}: {
  initialEntries: ProgramWaitlistEntryWithUser[];
  canEdit: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (id: string, status: ProgramWaitlistStatus) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/program-waitlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setError(apiError(res, json, "Хадгалж чадсангүй"));
        return;
      }
      // Байрыг серверийн дүрмээр дахин тооцно: хүлээж буй мөрүүд л дугаарлагдана.
      setEntries((list) => {
        const next = list.map((e) => (e.id === id ? { ...e, status } : e));
        let position = 0;
        return next.map((e) => {
          const queued = e.status === "waiting" || e.status === "notified";
          if (queued) position += 1;
          return { ...e, position: queued ? position : 0 };
        });
      });
    } catch {
      setError("Сүлжээний алдаа");
    } finally {
      setBusyId(null);
    }
  };

  if (entries.length === 0) {
    return (
      <p className="text-ink-3 font-semibold text-[.9rem]">
        Хүлээлгийн жагсаалтад хэн ч бүртгүүлээгүй байна.
      </p>
    );
  }

  return (
    <>
      {error && <p className="text-red-soft font-bold text-[.88rem] mb-3">{error}</p>}
      <div className="divide-y divide-line">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 py-3 flex-wrap">
            <span className="w-9 shrink-0 text-center font-extrabold text-[.95rem] text-ink-3">
              {entry.position > 0 ? `№${entry.position}` : "—"}
            </span>
            <div className="flex-1 min-w-[180px]">
              {entry.user ? (
                <Link
                  href={`/admin/users/${entry.user.id}`}
                  className="font-extrabold text-[.92rem] block hover:text-blue-strong hover:underline"
                >
                  {[entry.user.lastName, entry.user.firstName].filter(Boolean).join(" ") ||
                    "Нэр тодорхойгүй"}
                </Link>
              ) : (
                <b className="font-extrabold text-[.92rem] block">Нэр тодорхойгүй</b>
              )}
              <span className="text-[.82rem] font-semibold text-ink-3">
                {[entry.user?.phone, entry.user?.grade].filter(Boolean).join(" · ") || "—"}
              </span>
              {/* Өөрийнхөө сургалтын дараалалд зогссон хүн рүү "суудал
                  гарлаа" гэж залгах нь эвгүй — мөрөн дээр нь шууд хэлнэ. */}
              {entry.registrations.some((r) => r.sameProgram) ? (
                <span className="inline-flex items-center gap-1 text-[.78rem] font-extrabold text-red-soft bg-red-soft/12 rounded-full px-2.5 py-0.5 mt-1">
                  ⚠ Энэ сургалтад аль хэдийн бүртгэлтэй
                </span>
              ) : entry.registrations.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-[.78rem] font-bold text-gold-strong bg-gold-soft rounded-full px-2.5 py-0.5 mt-1">
                  {`Өөр сургалтад бүртгэлтэй: ${entry.registrations.map((r) => r.programLabel).join(", ")}`}
                </span>
              ) : null}
            </div>
            <span className="text-[.78rem] font-bold text-ink-3 tabular-nums">
              {new Date(entry.createdAt).toLocaleDateString("mn-MN")}
            </span>
            <span
              className={`text-[.76rem] font-extrabold px-2.5 py-1 rounded-full ${
                entry.status === "waiting"
                  ? "bg-blue-soft text-blue-strong"
                  : entry.status === "notified"
                    ? "bg-green-soft/20 text-green"
                    : "bg-bg-soft text-ink-3"
              }`}
            >
              {STATUS_LABEL[entry.status]}
            </span>
            {canEdit && (
              <div className="flex items-center gap-1.5">
                {entry.status !== "notified" && (
                  <button
                    type="button"
                    disabled={busyId === entry.id}
                    onClick={() => setStatus(entry.id, "notified")}
                    className="h-8 px-3 rounded-md border border-line font-extrabold text-[.8rem] disabled:opacity-50"
                  >
                    Холбогдсон
                  </button>
                )}
                {entry.status !== "closed" && (
                  <button
                    type="button"
                    disabled={busyId === entry.id}
                    onClick={() => setStatus(entry.id, "closed")}
                    className="h-8 px-3 rounded-md border border-line font-extrabold text-[.8rem] text-ink-3 disabled:opacity-50"
                  >
                    Хаах
                  </button>
                )}
                {entry.status !== "waiting" && (
                  <button
                    type="button"
                    disabled={busyId === entry.id}
                    onClick={() => setStatus(entry.id, "waiting")}
                    className="h-8 px-3 rounded-md border border-line font-extrabold text-[.8rem] text-ink-3 disabled:opacity-50"
                  >
                    Буцаах
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
