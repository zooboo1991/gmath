"use client";

import Link from "next/link";
import { useState } from "react";
import { FILTER_INPUT_CLASS } from "@/components/admin/panels/shared";

export default function AssessmentPanel({ initialFee }: { initialFee: string }) {
  const [fee, setFee] = useState(initialFee);
  const [savingFee, setSavingFee] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeSaved, setFeeSaved] = useState(false);

  const saveFee = async () => {
    setSavingFee(true);
    setFeeError(null);
    setFeeSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "assessment_fee", value: fee }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeeError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      setFee(json.value);
      setFeeSaved(true);
    } catch {
      setFeeError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSavingFee(false);
    }
  };

  const cards = [
    {
      href: "/admin/problems",
      title: "Бодлогын сан",
      text: "Бодлогыг LaTeX эсвэл зургаар оруулах, түвшин, хүндрэлээр нь ангилах.",
    },
    {
      href: "/admin/levels",
      title: "Түвшний тайлбар",
      text: "1-10 түвшин бүрийн хамрах хүрээ, дараагийн түвшинд гарах зам, санал болгох сургалт.",
    },
    {
      href: "/admin/grading",
      title: "Шалгах дараалал",
      text: "Илгээгдсэн бодолтыг шалгаж, багш эцсийн түвшинг тогтооно.",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
        <h2 className="text-[1.05rem] font-extrabold mb-1">Үнэлгээний төлбөр</h2>
        <p className="text-ink-3 font-semibold text-[.85rem] mb-3">
          Сурагч түвшин тогтоох тестээ эхлүүлэхийн өмнө төлөх дүн.
        </p>
        <div className="flex gap-2.5 flex-wrap items-start">
          <input
            type="text"
            value={fee}
            onChange={(e) => {
              setFee(e.target.value);
              setFeeSaved(false);
            }}
            placeholder="20,000₮"
            className={`${FILTER_INPUT_CLASS} max-w-[200px]`}
          />
          <button
            type="button"
            disabled={savingFee}
            onClick={saveFee}
            className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full disabled:opacity-50"
          >
            {savingFee ? "Хадгалж байна…" : "Хадгалах"}
          </button>
          {feeSaved && (
            <span className="text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-2 rounded-full">
              Хадгаллаа
            </span>
          )}
        </div>
        {feeError && <p className="text-red-soft font-semibold text-[.85rem] mt-2">{feeError}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card-flat px-[20px] py-[20px] hover:border-blue-soft-2"
          >
            <b className="text-[1.02rem] font-extrabold block">{c.title}</b>
            <p className="text-[.87rem] text-ink-2 font-medium mt-1.5">{c.text}</p>
            <span className="inline-block text-[.85rem] font-extrabold text-blue-strong mt-3">Нээх →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
