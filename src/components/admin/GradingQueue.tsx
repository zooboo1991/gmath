"use client";

import Link from "next/link";
import { useState } from "react";
import type { AssessmentWithUser } from "@/lib/assessment/db";

const CARD = "bg-surface border border-line rounded-md shadow-xs px-[18px] py-[16px]";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("mn-MN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Days a submission has been sitting in the queue. */
function waitingDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function GradingQueue({
  queue,
  completed,
}: {
  queue: AssessmentWithUser[];
  completed: AssessmentWithUser[];
}) {
  const [tab, setTab] = useState<"queue" | "completed">("queue");
  const rows = tab === "queue" ? queue : completed;

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="sticky top-0 z-10 bg-surface border-b border-line">
        <div className="wrap flex items-center justify-between h-[68px]">
          <Link
            href="/admin?tab=assessment"
            className="inline-flex items-center gap-2 font-extrabold text-ink-2 hover:text-ink text-[.92rem]"
          >
            ← Буцах
          </Link>
          <b className="font-extrabold text-[1rem]">Шалгах дараалал</b>
          <span className="w-[70px]" />
        </div>
      </header>

      <div className="wrap max-w-[860px] py-7">
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setTab("queue")}
            className={`font-extrabold text-[.92rem] px-5 py-2.5 rounded-full transition-colors ${
              tab === "queue" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Хүлээгдэж буй {queue.length > 0 && `(${queue.length})`}
          </button>
          <button
            type="button"
            onClick={() => setTab("completed")}
            className={`font-extrabold text-[.92rem] px-5 py-2.5 rounded-full transition-colors ${
              tab === "completed" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Дууссан ({completed.length})
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-ink-3 font-semibold text-[.9rem] text-center py-12">
            {tab === "queue" ? "Шалгах бодолт алга байна." : "Дууссан үнэлгээ алга байна."}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rows.map((a) => {
              const days = waitingDays(a.createdAt);
              return (
                <Link key={a.id} href={`/admin/grading/${a.id}`} className={`${CARD} block hover:border-blue-soft-2`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <b className="text-[1rem] font-extrabold block">
                        {a.user ? `${a.user.lastName} ${a.user.firstName}` : "Хэрэглэгч устсан"}
                      </b>
                      <span className="text-[.85rem] text-ink-3 font-semibold">
                        {a.user?.grade ?? "—"} · {a.user?.phone ?? "—"} · {formatDate(a.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {a.estimatedLevel && (
                        <span className="text-[.72rem] font-extrabold text-ink-2 bg-surface-2 px-2.5 py-1 rounded-full">
                          Тооцоолсон {a.estimatedLevel}
                        </span>
                      )}
                      {a.status === "completed" ? (
                        <span className="text-[.72rem] font-extrabold text-green bg-green-soft px-2.5 py-1 rounded-full">
                          Түвшин {a.finalLevel}
                        </span>
                      ) : a.status === "grading" ? (
                        <span className="text-[.72rem] font-extrabold text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
                          Шалгаж байна
                        </span>
                      ) : (
                        <span
                          className={`text-[.72rem] font-extrabold px-2.5 py-1 rounded-full ${
                            days >= 3
                              ? "text-red-soft bg-[oklch(0.95_0.03_25)]"
                              : "text-gold-strong bg-gold-soft"
                          }`}
                        >
                          {days === 0 ? "Өнөөдөр" : `${days} хоног хүлээсэн`}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
