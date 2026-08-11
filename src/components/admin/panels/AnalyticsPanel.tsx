"use client";

import { useState } from "react";
import type { AnalyticsRangeStats } from "@/lib/db";
import { formatMnt } from "@/lib/price";
import { StatSection, StatTile } from "@/components/admin/panels/DashboardPanel";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInputStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  return monday;
}

const ANALYTICS_PRESETS: { label: string; range: () => [string, string] }[] = [
  {
    label: "Өнөөдөр",
    range: () => {
      const t = toDateInputStr(new Date());
      return [t, t];
    },
  },
  {
    label: "Өчигдөр",
    range: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const t = toDateInputStr(d);
      return [t, t];
    },
  },
  {
    label: "Энэ долоо хоног",
    range: () => {
      const now = new Date();
      return [toDateInputStr(startOfWeek(now)), toDateInputStr(now)];
    },
  },
  {
    label: "Энэ сар",
    range: () => {
      const now = new Date();
      return [toDateInputStr(new Date(now.getFullYear(), now.getMonth(), 1)), toDateInputStr(now)];
    },
  },
];


export default function AnalyticsPanel({
  initialData,
  initialFrom,
  initialTo,
  viewsAllTime,
}: {
  initialData: AnalyticsRangeStats;
  initialFrom: string;
  initialTo: string;
  viewsAllTime: number;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState(initialData);
  const [activePreset, setActivePreset] = useState<string | null>("Энэ сар");
  const [loading, setLoading] = useState(false);

  const fetchRange = async (f: string, t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?from=${f}&to=${t}`);
      const json = await res.json();
      if (res.ok) setData(json.stats);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: (typeof ANALYTICS_PRESETS)[number]) => {
    const [f, t] = preset.range();
    setFrom(f);
    setTo(t);
    setActivePreset(preset.label);
    fetchRange(f, t);
  };

  const applyCustom = () => {
    if (!from || !to || from > to) return;
    setActivePreset(null);
    fetchRange(from, to);
  };

  const maxDaily = Math.max(1, ...data.daily.map((d) => d.views));
  const hasDaily = data.daily.some((d) => d.views > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap mb-3.5">
          {ANALYTICS_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className={`font-extrabold text-[.85rem] px-4 py-2 rounded-full transition-colors ${
                activePreset === p.label ? "bg-blue text-white" : "bg-bg-soft text-ink-2"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2.5 flex-wrap">
          <label className="flex flex-col gap-1.5">
            <span className="text-[.78rem] font-extrabold text-ink-3">Эхлэх огноо</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.78rem] font-extrabold text-ink-3">Дуусах огноо</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue"
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={applyCustom}
            className="text-[.85rem] font-extrabold text-white bg-blue px-5 py-2.5 rounded-full disabled:opacity-50 h-fit"
          >
            {loading ? "…" : "Шүүх"}
          </button>
        </div>
      </div>

      <StatSection title={`Хуудас үзэлт (${from} – ${to})`}>
        <StatTile label="Үзэлт" value={data.views} />
        <StatTile label="Давхардалгүй зочин" value={data.visitors} tone="green" />
        <StatTile label="Нийт (бүх цаг)" value={viewsAllTime} tone="blue" />
      </StatSection>

      <StatSection title={`Бүртгэл, орлого (${from} – ${to})`}>
        <StatTile label="Шинэ бүртгэл" value={data.newRegistrations} />
        <StatTile label="Баталгаажсан орлого" value={formatMnt(data.newRevenue)} tone="blue" />
        <StatTile label="Шинэ хэрэглэгч" value={data.newUsers} tone="green" />
      </StatSection>

      <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
        <h3 className="font-extrabold text-[1rem] mb-4">Өдөр тутмын үзэлт</h3>
        {!hasDaily ? (
          <p className="text-ink-3 font-semibold text-[.9rem]">Мэдээлэл алга байна.</p>
        ) : (
          <div className="flex items-end gap-1 h-28 overflow-x-auto">
            {data.daily.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.views}`}
                className="w-3 shrink-0 bg-blue rounded-t-xs"
                style={{ height: `${Math.max(2, Math.round((d.views / maxDaily) * 100))}%` }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 nav:grid-cols-2 gap-4">
        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
          <h3 className="font-extrabold text-[1rem] mb-4">Хамгийн их үзсэн хуудас</h3>
          {data.topPages.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.9rem]">Мэдээлэл алга байна.</p>
          ) : (
            <div className="flex flex-col">
              {data.topPages.map((p) => (
                <div
                  key={p.path}
                  className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0"
                >
                  <span className="font-bold text-[.88rem] text-ink-2 truncate">{p.path}</span>
                  <span className="shrink-0 font-extrabold text-[.85rem]">{p.views}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
          <h3 className="font-extrabold text-[1rem] mb-4">Эх сурвалж</h3>
          {data.topReferrers.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.9rem]">Мэдээлэл алга байна.</p>
          ) : (
            <div className="flex flex-col">
              {data.topReferrers.map((r) => (
                <div
                  key={r.referrer}
                  className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0"
                >
                  <span className="font-bold text-[.88rem] text-ink-2 truncate">{r.referrer}</span>
                  <span className="shrink-0 font-extrabold text-[.85rem]">{r.views}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-ink-3 font-semibold text-[.78rem]">
        Дээрх бүх мэдээлэл (хуудас үзэлт, бүртгэл, орлого, өдөр тутмын жагсаалт, хамгийн их үзсэн хуудас, эх
        сурвалж) сонгосон хугацааны хүрээнд харагдаж байна. &quot;Нийт (бүх цаг)&quot; ганцаараа бүх түүхэн дүн.
      </p>
    </div>
  );
}
