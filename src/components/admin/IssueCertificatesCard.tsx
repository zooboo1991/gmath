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

type PlannedRow = {
  holder: "student" | "teacher";
  certificateNumber: string;
  lastName: string;
  firstName: string;
  phone: string;
  category: string;
  course: string;
  issuedDate: string;
};

/**
 * Issues certificates to a finished course's roster.
 *
 * Deliberately a form rather than one button: the number is generated
 * ("S2608001"), but what the certificate *says* — which class, which course —
 * is the school's wording, and only the person issuing them knows it.
 *
 * And deliberately preview-then-issue: the numbers continue from the last
 * batch and there is no undo, so a typo in the course letter would otherwise
 * be discovered only after it was printed on every child's certificate.
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
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [preview, setPreview] = useState<{ rows: PlannedRow[]; skipped: number } | null>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);

  const body = () => JSON.stringify({ course, studentCategory, teacherCategory, issuedDate });

  /** Any edit invalidates what is on screen — a stale preview is worse than none. */
  const edited = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPreview(null);
    setResult(null);
    if (sampleUrl) URL.revokeObjectURL(sampleUrl);
    setSampleUrl(null);
  };

  const showPreview = async () => {
    if (!course.trim()) {
      setError("Курсээ бичнэ үү (жишээ нь: I).");
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${programId}/certificates/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body(),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Харахад алдаа гарлаа");
        return;
      }
      setPreview({ rows: json.rows, skipped: json.skipped });
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPreviewing(false);
    }
  };

  const showSample = async (holder: "student" | "teacher") => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${programId}/certificates/preview/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course, studentCategory, teacherCategory, issuedDate, holder }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Жишээ батламж гаргахад алдаа гарлаа");
        return;
      }
      const blob = await res.blob();
      if (sampleUrl) URL.revokeObjectURL(sampleUrl);
      setSampleUrl(URL.createObjectURL(blob));
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    }
  };

  const issue = async () => {
    if (!course.trim()) {
      setError("Курсээ бичнэ үү (жишээ нь: I).");
      return;
    }
    const count = preview ? preview.rows.length : activeCount;
    if (
      !confirm(
        `${count} сертификат үүсгэх үү? Дугаар нь эргэж буцахгүй үргэлжилнэ — үүсгэсний дараа буцаах товч байхгүй.`
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
        body: body(),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Үүсгэхэд алдаа гарлаа");
        return;
      }
      setResult({ created: json.created, skipped: json.skipped });
      setPreview(null);
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
            onChange={(e) => edited(setCourse)(e.target.value)}
            placeholder="Жишээ: I"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[.8rem] font-extrabold text-ink-3">Олгосон огноо</span>
          <input
            type="date"
            value={issuedDate}
            onChange={(e) => edited(setIssuedDate)(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[.8rem] font-extrabold text-ink-3">Сурагчийн ангилал</span>
          <input
            type="text"
            value={studentCategory}
            onChange={(e) => edited(setStudentCategory)(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[.8rem] font-extrabold text-ink-3">Багшийн ангилал</span>
          <input
            type="text"
            value={teacherCategory}
            onChange={(e) => edited(setTeacherCategory)(e.target.value)}
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

      {preview && (
        <div className="mt-4 border border-line rounded-md overflow-hidden">
          <div className="bg-bg-soft px-4 py-2.5 flex items-center gap-3 flex-wrap">
            <b className="font-extrabold text-[.88rem]">
              Туршилтаар: {preview.rows.length} сертификат үүснэ
            </b>
            {preview.skipped > 0 && (
              <span className="text-[.8rem] font-bold text-ink-3">
                · {preview.skipped} хүн энэ курсээр өмнө нь авсан тул алгасагдана
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => showSample("student")}
                className="text-[.8rem] font-extrabold text-blue-strong hover:underline"
              >
                Сурагчийн батламж харах
              </button>
              {preview.rows.some((r) => r.holder === "teacher") && (
                <button
                  type="button"
                  onClick={() => showSample("teacher")}
                  className="text-[.8rem] font-extrabold text-blue-strong hover:underline"
                >
                  Багшийн батламж харах
                </button>
              )}
            </span>
          </div>

          {preview.rows.length === 0 ? (
            <p className="px-4 py-3 text-ink-3 font-semibold text-[.85rem]">
              Үүсэх сертификат алга — баталгаажсан бүртгэл байхгүй, эсвэл бүгд энэ курсээр
              өмнө нь авсан байна.
            </p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto divide-y divide-line">
              {preview.rows.map((row) => (
                <div
                  key={row.certificateNumber}
                  className="flex items-center gap-3 px-4 py-2.5 flex-wrap"
                >
                  <span className="font-extrabold text-[.88rem] tabular-nums w-[92px] shrink-0">
                    {row.certificateNumber}
                  </span>
                  <span className="font-bold text-[.88rem] flex-1 min-w-[140px]">
                    {row.lastName} {row.firstName}
                  </span>
                  <span className="text-[.8rem] font-semibold text-ink-3 tabular-nums">
                    {row.phone}
                  </span>
                  <span
                    className={`text-[.74rem] font-extrabold px-2 py-0.5 rounded-full ${
                      row.holder === "teacher"
                        ? "bg-gold-soft text-gold-strong"
                        : "bg-blue-soft text-blue-strong"
                    }`}
                  >
                    {row.category}
                  </span>
                </div>
              ))}
            </div>
          )}

          {sampleUrl && (
            <div className="border-t border-line">
              <iframe
                src={sampleUrl}
                title="Жишээ батламж"
                className="w-full h-[420px] bg-bg-soft"
              />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2.5 mt-4 flex-wrap">
        <button
          type="button"
          disabled={previewing || activeCount === 0}
          onClick={showPreview}
          className="font-extrabold text-[.9rem] text-blue-strong border border-blue-soft-2 rounded-full px-6 py-3 disabled:opacity-50"
        >
          {previewing ? "Харж байна…" : "Туршилтаар харах"}
        </button>
        <button
          type="button"
          disabled={busy || activeCount === 0}
          onClick={issue}
          className="font-extrabold text-[.9rem] text-white bg-blue shadow-blue rounded-full px-6 py-3 disabled:opacity-50"
        >
          {busy ? "Үүсгэж байна…" : `Сертификат үүсгэх (${activeCount})`}
        </button>
      </div>
    </div>
  );
}
