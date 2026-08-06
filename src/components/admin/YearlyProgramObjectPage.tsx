"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Lesson, PublicUser, Registration, YearlyProgram } from "@/lib/db";
import AdminField from "./AdminField";
import LessonScheduleEditor from "./LessonScheduleEditor";
import RegistrationRoster from "./RegistrationRoster";

type RegistrationWithUser = Registration & { user?: PublicUser };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-flat px-6 py-5">
      <h3 className="font-extrabold text-[1rem] text-ink mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function YearlyProgramObjectPage({
  program,
  initialRegistrations,
}: {
  program: YearlyProgram;
  initialRegistrations: RegistrationWithUser[];
}) {
  const router = useRouter();
  const [registrations, setRegistrations] = useState(initialRegistrations);

  const [form, setForm] = useState({
    tag: program.tag,
    title: program.title,
    label: program.label,
    topics: program.topics,
    price: program.price,
    period: program.period,
    facebookGroup: program.facebookGroup ?? "",
    zoomLink: program.zoomLink ?? "",
    zoomMeetingId: program.zoomMeetingId ?? "",
    zoomPasscode: program.zoomPasscode ?? "",
    lessons: program.lessons ?? ([] as Lesson[]),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const save = async () => {
    if (!form.tag.trim() || !form.title.trim() || !form.label.trim() || !form.price.trim() || !form.period.trim()) {
      setError("Заавал бөглөх талбаруудыг бөглөнө үү");
      return;
    }
    setError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/yearly/${program.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      setSavedMessage("Хадгалагдлаа");
      router.refresh();
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="sticky top-0 z-20 bg-surface border-b border-line">
        <div className="wrap py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin?tab=courses"
              className="inline-flex items-center gap-1.5 font-extrabold text-ink-2 hover:text-ink text-[.88rem] shrink-0"
            >
              ← Буцах
            </Link>
            <div className="min-w-0 border-l border-line pl-3">
              <span className="text-[.72rem] font-extrabold tracking-[.08em] uppercase text-blue-strong truncate block max-w-[220px]">
                {form.tag || "Ангилалгүй"}
              </span>
              <b className="block text-[1.02rem] truncate max-w-[360px]">{form.title || "1 жилийн хөтөлбөр"}</b>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {savedMessage && <span className="text-[.82rem] font-bold text-green">{savedMessage}</span>}
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="text-[.85rem] font-extrabold rounded-full bg-blue text-white shadow-blue px-5 py-2.5 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </button>
          </div>
        </div>
      </header>

      <div className="wrap max-w-[880px] py-8">
        {error && (
          <p className="bg-[oklch(0.97_0.03_25)] text-red-soft font-semibold text-[.9rem] rounded-md px-4 py-3 mb-5">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-5">
          <Card title="Ерөнхий мэдээлэл">
            <div className="flex flex-col gap-3">
              <AdminField label="Ангиллын тэмдэглэгээ (жишээ: C АНГИЛАЛ СУРАГЧ)">
                <input value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))} />
              </AdminField>
              <AdminField label="Гарчиг (карт дээр харагдана)">
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </AdminField>
              <AdminField label="Бүтэн нэр (бүртгэл, мэдэгдэлд харагдана)">
                <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              </AdminField>
              <AdminField label="Тайлбар">
                <input value={form.topics} onChange={(e) => setForm((f) => ({ ...f, topics: e.target.value }))} />
              </AdminField>
              <div className="grid grid-cols-2 gap-3">
                <AdminField label="Үнэ">
                  <input
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="2,800,000₮"
                  />
                </AdminField>
                <AdminField label="Хугацааны нэгж">
                  <input
                    value={form.period}
                    onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                    placeholder="/ жил"
                  />
                </AdminField>
              </div>
              <AdminField label="Facebook группын холбоос (бүртгэл баталгаажсан сурагчид харагдана)">
                <input
                  value={form.facebookGroup}
                  onChange={(e) => setForm((f) => ({ ...f, facebookGroup: e.target.value }))}
                  placeholder="https://www.facebook.com/groups/..."
                />
              </AdminField>
            </div>
          </Card>

          <Card title="Zoom өрөө (бүх хичээлд)">
            <p className="text-ink-3 font-semibold text-[.85rem] -mt-2 mb-3.5">
              Давтагдах уулзалтын нэг холбоосыг энд оруулбал бүх хичээлд хэрэглэгдэнэ. Тодорхой хичээл
              өөр холбоостой бол доорх хуваарийн мөрөнд нь бичнэ. Төлбөрөө баталгаажуулсан сурагчид л
              харна.
            </p>
            <div className="flex flex-col gap-3">
              <AdminField label="Zoom холбоос">
                <input
                  value={form.zoomLink}
                  onChange={(e) => setForm((f) => ({ ...f, zoomLink: e.target.value }))}
                  placeholder="https://us02web.zoom.us/j/..."
                />
              </AdminField>
              <div className="grid grid-cols-2 gap-3">
                <AdminField label="Meeting ID (заавал биш)">
                  <input
                    value={form.zoomMeetingId}
                    onChange={(e) => setForm((f) => ({ ...f, zoomMeetingId: e.target.value }))}
                    placeholder="123 4567 8901"
                  />
                </AdminField>
                <AdminField label="Нэвтрэх код (заавал биш)">
                  <input
                    value={form.zoomPasscode}
                    onChange={(e) => setForm((f) => ({ ...f, zoomPasscode: e.target.value }))}
                    placeholder="123456"
                  />
                </AdminField>
              </div>
            </div>
          </Card>

          <p className="text-ink-3 font-semibold text-[.85rem] -mb-2">
            Энэ хуваарь нийтэд харагдахгүй — зөвхөн бүртгүүлж баталгаажсан сурагчдад профайл хуудсандаа
            харагдана. Сар бүрийн хичээлийг нэг мөрөөр оруулна уу.
          </p>
          <LessonScheduleEditor
            lessons={form.lessons}
            onChange={(lessons) => setForm((f) => ({ ...f, lessons }))}
            id={program.id}
            courseZoomLink={form.zoomLink}
          />

          <Card title="Бүртгүүлсэн сурагчид">
            <RegistrationRoster programId={program.id} registrations={registrations} onChange={setRegistrations} />
          </Card>
        </div>
      </div>
    </div>
  );
}
