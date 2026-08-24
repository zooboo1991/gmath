"use client";

import Link from "next/link";
import { useState } from "react";
import { INPUT_CLASS } from "@/components/admin/panels/shared";

/** Today, as the date input wants it. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Issues certificates to a finished course's roster.
 *
 * Deliberately a form rather than one button: the number is generated
 * ("S2608001"), but what the certificate *says* — which class, which course —
 * is the school's wording, and only the person issuing them knows it.
 */
export default function IssueCertificatesCard({
  programId,
  defaultStudentCategory,
  activeCount,
}: {
  programId: string;
  /** The programme's class, as a starting point for the students' line. */
  defaultStudentCategory: string;
  /** How many confirmed registrations are on the roster right now. */
  activeCount: number;
}) {
  const [course, setCourse] = useState("");
  const [studentCategory, setStudentCategory] = useState(defaultStudentCategory);
  const [teacherCategory, setTeacherCategory] = useState("Багш");
  const [issuedDate, setIssuedDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  const issue = async () => {
    if (!course.trim()) {
      setError("Курсээ бичнэ үү (жишээ нь: I).");
      return;
    }
    if (
      !confirm(
        `Энэ сургалтын баталгаажсан ${activeCount} бүртгэлд сертификат үүсгэх үү? Өмнө нь энэ курсээр сертификат авсан хүн давхар үүсэхгүй.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/courses/${programId}/certificates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course, studentCategory, teacherCategory, issuedDate }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Үүсгэхэд алдаа гарлаа");
        return;
      }
      setResult({ created: json.created, skipped: json.skipped });
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
      <h3 className="font-extrabold text-[1rem]">Сургалт дууссаны сертификат</h3>
      <p className="text-ink-3 font-semibold text-[.85rem] mt-1">
        Баталгаажсан бүртгэлтэй сурагч, багш бүрд нэг бүрчлэн үүснэ. Дугаар нь өөрөө
        үргэлжилнэ: сурагч S{new Date().getFullYear().toString().slice(-2)}
        {String(new Date().getMonth() + 1).padStart(2, "0")}001, багш T… гэсэн хэлбэрээр.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[.8rem] font-extrabold text-ink-3">Курс</span>
          <input
            type="text"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            placeholder="Жишээ: I"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[.8rem] font-extrabold text-ink-3">Олгосон огноо</span>
          <input
            type="date"
            value={issuedDate}
            onChange={(e) => setIssuedDate(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[.8rem] font-extrabold text-ink-3">Сурагчийн ангилал</span>
          <input
            type="text"
            value={studentCategory}
            onChange={(e) => setStudentCategory(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[.8rem] font-extrabold text-ink-3">Багшийн ангилал</span>
          <input
            type="text"
            value={teacherCategory}
            onChange={(e) => setTeacherCategory(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      {error && <p className="text-red-soft font-semibold text-[.85rem] mt-3">{error}</p>}
      {result && (
        <p className="text-green font-extrabold text-[.88rem] mt-3">
          {result.created} сертификат үүслээ
          {result.skipped > 0 && ` · ${result.skipped} хүн энэ курсээр өмнө нь авсан тул алгасав`}.{" "}
          <Link href="/admin/certificates" className="text-blue-strong underline">
            Сертификат цэсээс харах →
          </Link>
        </p>
      )}

      <button
        type="button"
        disabled={busy || activeCount === 0}
        onClick={issue}
        className="font-extrabold text-[.9rem] text-white bg-blue shadow-blue rounded-full px-6 py-3 mt-4 disabled:opacity-50"
      >
        {busy ? "Үүсгэж байна…" : `Сертификат үүсгэх (${activeCount})`}
      </button>
    </div>
  );
}
