"use client";

import { apiError, readJson } from "@/lib/fetchJson";
import { formatMb, MAX_UPLOAD_BYTES } from "@/lib/imageResize";
import { useMemo, useRef, useState } from "react";
import type { Certificate, CertificateUsage } from "@/lib/db";
import { formatCourseDate } from "@/lib/courseDate";
import { INPUT_CLASS } from "@/components/admin/panels/shared";

const emptyCertForm = {
  certificateNumber: "",
  lastName: "",
  firstName: "",
  phone: "",
  category: "",
  course: "",
  issuedDate: "",
};


export default function CertificatesPanel({
  initialCertificates,
  usage = {},
}: {
  initialCertificates: Certificate[];
  /** Downloads and public lookups per certificate id. */
  usage?: Record<string, CertificateUsage>;
}) {
  // Owned here now that the tab is a standalone route — the old dashboard
  // parent used to hold this state and pass the setter down.
  const [certificates, setCertificates] = useState(initialCertificates);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{ imported: number; skipped: { row: number; reason: string }[] } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyCertForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyCertForm);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (c: Certificate) => {
    setEditingId(c.id);
    setForm({
      certificateNumber: c.certificateNumber,
      lastName: c.lastName,
      firstName: c.firstName,
      phone: c.phone,
      category: c.category,
      course: c.course,
      issuedDate: c.issuedDate,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(editingId ? `/api/admin/certificates/${editingId}` : "/api/admin/certificates", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await readJson<{ certificate: Certificate }>(res);
      const saved = json.certificate;
      if (!res.ok || !saved) {
        setFormError(apiError(res, json, "Хадгалахад алдаа гарлаа"));
        return;
      }
      if (editingId) {
        setCertificates((cs) => cs.map((c) => (c.id === editingId ? saved : c)));
      } else {
        setCertificates((cs) => [saved, ...cs]);
      }
      closeForm();
    } catch {
      setFormError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(
          `Файл хэт том байна (${formatMb(file.size)}). ${formatMb(MAX_UPLOAD_BYTES)}-ээс бага файл оруулна уу.`
        );
        return;
      }

      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/certificates", { method: "POST", body });
      const json = await readJson<{ imported: number; skipped: { row: number; reason: string }[] }>(res);
      if (!res.ok) {
        setError(apiError(res, json, "Импорт хийхэд алдаа гарлаа"));
        return;
      }
      setResult({ imported: json.imported ?? 0, skipped: json.skipped ?? [] });
      const listRes = await fetch("/api/admin/certificates");
      const listJson = await readJson<{ certificates: Certificate[] }>(listRes);
      if (listRes.ok && listJson.certificates) setCertificates(listJson.certificates);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeCertificate = async (id: string) => {
    if (!confirm("Энэ сертификатыг устгах уу?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/certificates/${id}`, { method: "DELETE" });
      if (res.ok) setCertificates((cs) => cs.filter((c) => c.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return certificates;
    return certificates.filter(
      (c) =>
        c.certificateNumber.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        `${c.lastName} ${c.firstName}`.toLowerCase().includes(q)
    );
  }, [certificates, search]);

  return (
    <div>
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-4">
        <h2 className="text-[1.05rem] font-extrabold mb-1">Excel-ээс сертификат импортлох</h2>
        <p className="text-ink-3 font-semibold text-[.85rem] mb-3">
          Баганын нэрс: Сертификатын дугаар, Овог, Нэр, Утасны дугаар, Сургалтын ангилал, Курс, Сургалтанд хамрагдсан
          огноо. Утасны дугаараар нь хэрэглэгчийн профайлтай холбогдоно. Давхцсан дугаартай мөрийг шинэчилнэ.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={uploading}
          className="text-[.85rem] font-semibold"
        />
        {uploading && <p className="text-ink-3 font-semibold text-[.85rem] mt-2">Импортлож байна…</p>}
        {error && <p className="text-red-soft font-semibold text-[.85rem] mt-2">{error}</p>}
        {result && (
          <div className="mt-3">
            <p className="text-green font-extrabold text-[.88rem]">{result.imported} мөр импортлогдлоо.</p>
            {result.skipped.length > 0 && (
              <div className="mt-1.5">
                <p className="text-gold-strong font-extrabold text-[.85rem]">{result.skipped.length} мөр алгассан:</p>
                <ul className="text-ink-3 font-semibold text-[.82rem] list-disc pl-5">
                  {result.skipped.slice(0, 10).map((s, i) => (
                    <li key={i}>
                      {s.row}-р мөр: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {formOpen && (
        <form
          onSubmit={submitForm}
          className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-4"
        >
          <h2 className="text-[1.05rem] font-extrabold mb-3">
            {editingId ? "Сертификат засах" : "Сертификат гараар нэмэх"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Сертификатын дугаар</span>
              <input
                type="text"
                required
                value={form.certificateNumber}
                onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Утасны дугаар</span>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Овог</span>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Нэр</span>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Сургалтын ангилал</span>
              <input
                type="text"
                required
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Курс</span>
              <input
                type="text"
                required
                value={form.course}
                onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Сургалтанд хамрагдсан огноо</span>
              <input
                type="date"
                required
                value={form.issuedDate}
                onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))}
                className={INPUT_CLASS}
              />
            </label>
          </div>
          {formError && <p className="text-red-soft font-semibold text-[.85rem] mt-3">{formError}</p>}
          <div className="flex gap-2.5 mt-4">
            <button
              type="submit"
              disabled={saving}
              className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2 rounded-full disabled:opacity-50"
            >
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="text-[.85rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2 rounded-full"
            >
              Цуцлах
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-[1.15rem] font-extrabold">
          Сертификатууд ({filtered.length}
          {filtered.length !== certificates.length && ` / ${certificates.length}`})
        </h2>
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="text"
            placeholder="Дугаар эсвэл нэрээр хайх"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_CLASS} max-w-[260px]`}
          />
          {!formOpen && (
            <button
              type="button"
              onClick={openCreateForm}
              className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full whitespace-nowrap"
            >
              + Гараар нэмэх
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem] text-center py-10">
          {certificates.length === 0 ? "Одоогоор сертификат алга." : "Тохирох сертификат алга байна."}
        </p>
      ) : (
        <div className="bg-surface border border-line rounded-md shadow-xs overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="text-ink-3 text-[.76rem] font-extrabold tracking-[.05em] uppercase">
                <th className="px-4 py-3">Дугаар</th>
                <th className="px-4 py-3">Овог, нэр</th>
                <th className="px-4 py-3">Утас</th>
                <th className="px-4 py-3">Ангилал</th>
                <th className="px-4 py-3">Курс</th>
                <th className="px-4 py-3">Огноо</th>
                <th className="px-4 py-3 text-center">Татсан</th>
                <th className="px-4 py-3 text-center">Шалгасан</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3 font-extrabold text-[.9rem]">{c.certificateNumber}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">
                    {c.lastName} {c.firstName}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{c.phone}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{c.category}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{c.course}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">
                    {formatCourseDate(c.issuedDate)}
                  </td>
                  <td className="px-4 py-3 text-center font-extrabold text-[.88rem] tabular-nums">
                    <UsageCount value={usage[c.id]?.downloads ?? 0} />
                  </td>
                  <td className="px-4 py-3 text-center font-extrabold text-[.88rem] tabular-nums">
                    <UsageCount value={usage[c.id]?.verifies ?? 0} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEditForm(c)}
                      className="text-[.8rem] font-extrabold text-blue-strong bg-blue-soft px-3 py-1.5 rounded-full mr-2"
                    >
                      Засах
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => removeCertificate(c.id)}
                      className="text-[.8rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3 py-1.5 rounded-full disabled:opacity-50"
                    >
                      {busyId === c.id ? "…" : "Устгах"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A zero reads as "nobody has, yet" rather than as a number worth scanning. */
function UsageCount({ value }: { value: number }) {
  if (value === 0) return <span className="text-ink-3 font-bold">—</span>;
  return <span>{value}</span>;
}


/**
 * Hub for the level-assessment feature: the fee (stored in app_settings so it
 * can change without a redeploy) plus links to the problem bank, the level
 * descriptions, and the grading queue.
 */
