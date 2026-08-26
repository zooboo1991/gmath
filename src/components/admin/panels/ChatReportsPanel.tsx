"use client";

import { useEffect, useState } from "react";
import type { ChatReport } from "@/lib/chatReport";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { formatDateTime } from "@/lib/dateFormat";

/** Today and a week ago, as the date inputs want them. */
function isoDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Чатын тайлан: what people asked the bot in a chosen stretch of days,
 * sorted into themes by the model and kept as a list to look back at.
 *
 * Every report is stored, never recomputed on view — the same week must read
 * the same way next month, and each run costs a model call.
 */
export default function ChatReportsPanel() {
  const [reports, setReports] = useState<ChatReport[] | null>(null);
  const [fromDate, setFromDate] = useState(isoDay(-7));
  const [toDate, setToDate] = useState(isoDay());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/chat-reports")
      .then((res) => (res.ok ? res.json() : { reports: [] }))
      .then((json) => {
        if (cancelled) return;
        setReports(json.reports ?? []);
        setOpenId(json.reports?.[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setReports([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/chat-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Тайлан гаргахад алдаа гарлаа");
        return;
      }
      setReports((current) => [json.report, ...(current ?? [])]);
      setOpenId(json.report.id);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
        <h3 className="font-extrabold text-[1rem]">Шинэ тайлан гаргах</h3>
        <p className="text-ink-3 font-semibold text-[.85rem] mt-1">
          Сонгосон хугацаанд чатаар ирсэн бүх асуултыг уншиж, сэдвээр нь ангилаад анхаарах зүйлсийг
          нь ялгаж өгнө. Даваа гараг бүр өнгөрсөн долоо хоногийн тайлан өөрөө үүснэ.
        </p>
        <div className="flex items-end gap-2.5 flex-wrap mt-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[.78rem] font-extrabold text-ink-3">Эхлэх огноо</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.78rem] font-extrabold text-ink-3">Дуусах огноо</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <button
            type="button"
            disabled={busy || !fromDate || !toDate || fromDate > toDate}
            onClick={build}
            className="font-extrabold text-[.88rem] text-white bg-blue shadow-blue px-6 py-3 rounded-full disabled:opacity-50"
          >
            {busy ? "Боловсруулж байна…" : "Тайлан гаргах"}
          </button>
        </div>
        {error && <p className="text-red-soft font-semibold text-[.85rem] mt-3">{error}</p>}
      </div>

      {reports === null && (
        <p className="text-ink-3 font-semibold text-[.9rem]">Ачааллаж байна…</p>
      )}
      {reports?.length === 0 && (
        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-8 text-center">
          <p className="text-ink-3 font-semibold">
            Тайлан алга байна. Дээрээс огноогоо сонгоод эхнийхээ гаргаж үзээрэй.
          </p>
        </div>
      )}

      {reports?.map((report) => {
        const open = openId === report.id;
        return (
          <div key={report.id} className="bg-surface border border-line rounded-md shadow-xs">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : report.id)}
              className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0">
                <b className="font-extrabold text-[.98rem] block">
                  {report.fromDate.replaceAll("-", ".")} — {report.toDate.replaceAll("-", ".")}
                </b>
                <span className="text-ink-3 font-semibold text-[.82rem]">
                  {report.messageCount} мессеж · {report.conversationCount} харилцан яриа ·{" "}
                  {formatDateTime(report.createdAt)}
                  {report.createdBy ? ` · ${report.createdBy}` : " · автомат"}
                </span>
              </div>
              <span className="shrink-0 text-[.85rem] font-extrabold text-blue-strong">
                {open ? "Хаах" : "Дэлгэрэнгүй"}
              </span>
            </button>

            {open && (
              <div className="px-6 pb-6 border-t border-line pt-4 flex flex-col gap-5">
                <p className="text-ink font-semibold leading-[1.7]">{report.summary.headline}</p>

                {report.summary.attention.length > 0 && (
                  <section>
                    <h4 className="font-extrabold text-[.92rem] text-red-soft mb-2">Анхаарах зүйлс</h4>
                    <div className="flex flex-col gap-2">
                      {report.summary.attention.map((item, i) => (
                        <div key={i} className="bg-[oklch(0.97_0.03_25)] rounded-sm px-4 py-3">
                          <b className="font-extrabold text-[.9rem] block">{item.issue}</b>
                          {item.detail && (
                            <span className="text-ink-2 font-medium text-[.85rem]">{item.detail}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {report.summary.themes.length > 0 && (
                  <section>
                    <h4 className="font-extrabold text-[.92rem] mb-2">Юуны тухай асуусан бэ</h4>
                    <div className="flex flex-col">
                      {report.summary.themes.map((theme, i) => {
                        const max = Math.max(...report.summary.themes.map((t) => t.count || 0), 1);
                        return (
                          <div key={i} className="py-2 border-b border-line last:border-0">
                            <div className="flex items-center justify-between gap-3">
                              <b className="font-extrabold text-[.9rem]">{theme.theme}</b>
                              <span className="text-[.85rem] font-extrabold text-blue-strong tabular-nums shrink-0">
                                {theme.count}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-sm bg-bg-soft overflow-hidden mt-1.5">
                              <div
                                className="h-full bg-blue rounded-sm"
                                style={{ width: `${Math.round(((theme.count || 0) / max) * 100)}%` }}
                              />
                            </div>
                            {theme.example && (
                              <span className="text-ink-3 font-medium text-[.82rem] block mt-1">
                                «{theme.example}»
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {report.summary.faq.length > 0 && (
                  <section>
                    <h4 className="font-extrabold text-[.92rem] mb-2">Их асуудаг асуултууд</h4>
                    <div className="flex flex-col gap-2">
                      {report.summary.faq.map((item, i) => (
                        <div key={i} className="bg-bg-soft rounded-sm px-4 py-3">
                          <b className="font-extrabold text-[.9rem] block">{item.question}</b>
                          {item.answer && (
                            <span className="text-ink-2 font-medium text-[.85rem]">{item.answer}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {report.summary.suggestions.length > 0 && (
                  <section>
                    <h4 className="font-extrabold text-[.92rem] mb-2">Хийвэл зохих зүйлс</h4>
                    <ul className="list-disc pl-5 text-ink-2 font-medium text-[.9rem] flex flex-col gap-1">
                      {report.summary.suggestions.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
