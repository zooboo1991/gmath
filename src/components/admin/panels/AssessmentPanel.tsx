"use client";

import Link from "next/link";
import { useState } from "react";
import { INPUT_CLASS } from "@/components/admin/panels/shared";

export default function AssessmentPanel({
  initialFee,
  initialQuizFee,
  initialSla,
  initialOpen,
}: {
  initialFee: string;
  initialQuizFee: string;
  initialSla: string;
  /** Whether students can reach the level test at all right now. */
  initialOpen: boolean;
}) {
  const cards = [
    {
      href: "/admin/exams",
      title: "Шалгалтууд",
      text: "Түвшин тогтоох шалгалт зохиох: бодлогоо сонгож, төлбөр, үнэгүй хамрагдах сурагчдаа тогтооно.",
    },
    {
      href: "/admin/placement",
      title: "Шаталсан шалгалтын сан",
      text: "Сэдэв бүр 3 түвшний бодлоготой: 2-оос эхэлж, зөв бол 3, буруу бол 1 рүү шилжинэ.",
    },
    {
      href: "/admin/quiz",
      title: "Тестийн асуултын сан",
      text: "Энгийн/Сонгон ангийн сонголттой асуултууд — анги тус бүрээр.",
    },
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
      <OpenSwitch initialOpen={initialOpen} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FeeCard
          title="Олимпиадын үнэлгээний төлбөр"
          text="Багш бодолтыг гардан шалгадаг төрлийн үнэ."
          settingKey="assessment_fee"
          initialValue={initialFee}
          placeholder="20,000₮"
        />
        <FeeCard
          title="Энгийн/Сонгон тестийн төлбөр"
          text="Автоматаар дүгнэгдэж, AI зөвлөмж өгдөг тестийн үнэ."
          settingKey="quiz_fee"
          initialValue={initialQuizFee}
          placeholder="10,000₮"
        />
        <FeeCard
          title="Хариу гарах хугацаа"
          text="Төлбөр төлөхийн өмнө эцэг эхэд амлаж буй хугацаа. Олимпиадын төрөлд харагдана."
          settingKey="assessment_sla"
          initialValue={initialSla}
          placeholder="1-2 хоног"
        />
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

/**
 * The kill switch. Closing hides the test from students everywhere — the page,
 * the profile button, the free taster and every endpoint behind them — which
 * is what the problem bank being mid-rewrite requires.
 */
function OpenSwitch({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    if (
      !next &&
      !confirm(
        "Түвшин тогтоох шалгалтыг хаах уу? Сурагчид хуудсыг нь харахгүй, эхэлсэн тест ч үргэлжлэхгүй болно."
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "assessment_enabled", value: next ? "on" : "off" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      setOpen(next);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`card-flat px-[22px] py-[20px] flex items-center justify-between gap-4 flex-wrap ${
        open ? "" : "border-red-soft/40 bg-red-soft/5"
      }`}
    >
      <div>
        <b className="text-[1.02rem] font-extrabold block">
          {open ? "Түвшин тогтоох нээлттэй" : "Түвшин тогтоох хаалттай"}
        </b>
        <p className="text-[.87rem] text-ink-2 font-medium mt-1.5 max-w-[62ch]">
          {open
            ? "Сурагчид /assessment хуудсаар орж тест өгч байна. Бодлогын сангаа шинэчлэх үед хаа."
            : "Сурагчдад «Түр хаалттай» гэж харагдана. Үнэгүй жишээ тест, эхэлсэн тестүүд ч зогссон."}
        </p>
        {error && <span className="text-[.82rem] font-bold text-red-soft block mt-1.5">{error}</span>}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={toggle}
        className={`shrink-0 font-extrabold text-[.88rem] px-5 py-2.5 rounded-full disabled:opacity-50 ${
          open ? "text-ink-2 bg-bg-soft" : "text-white bg-green"
        }`}
      >
        {saving ? "…" : open ? "Хаах" : "Нээх"}
      </button>
    </div>
  );
}

/** One editable app_settings price. The two fee cards differ only by key and copy. */
function FeeCard({
  title,
  text,
  settingKey,
  initialValue,
  placeholder,
}: {
  title: string;
  text: string;
  settingKey: string;
  initialValue: string;
  placeholder: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      setValue(json.value);
      setSaved(true);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
      <h2 className="text-[1.05rem] font-extrabold mb-1">{title}</h2>
      <p className="text-ink-3 font-semibold text-[.85rem] mb-3">{text}</p>
      <div className="flex gap-2.5 flex-wrap items-start">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder={placeholder}
          className={`${INPUT_CLASS} max-w-[200px]`}
        />
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full disabled:opacity-50"
        >
          {saving ? "Хадгалж байна…" : "Хадгалах"}
        </button>
        {saved && (
          <span className="text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-2 rounded-full">
            Хадгаллаа
          </span>
        )}
      </div>
      {error && <p className="text-red-soft font-semibold text-[.85rem] mt-2">{error}</p>}
    </div>
  );
}
