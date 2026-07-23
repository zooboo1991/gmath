"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Course, CourseKind, PublicUser, Registration } from "@/lib/db";
import { IconCheckCircle, IconClock, IconClose } from "@/components/icons";

type RegistrationWithUser = Registration & { user?: PublicUser };

const emptyCourseForm = {
  kind: "upcoming" as CourseKind,
  tag: "",
  title: "",
  topics: "",
  price: "",
  period: "",
  startDate: "",
  mode: "",
};

export default function AdminDashboard({
  initialRegistrations,
  initialCourses,
}: {
  initialRegistrations: RegistrationWithUser[];
  initialCourses: Course[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"registrations" | "courses">("registrations");
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [courses, setCourses] = useState(initialCourses);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCourseForm);
  const [formError, setFormError] = useState<string | null>(null);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}/approve`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setRegistrations((rs) => rs.map((r) => (r.id === id ? { ...r, status: "active" } : r)));
      }
      void json;
    } finally {
      setBusyId(null);
    }
  };

  const startAdd = (kind: CourseKind) => {
    setEditingId(null);
    setForm({ ...emptyCourseForm, kind });
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = (course: Course) => {
    setEditingId(course.id);
    setForm({
      kind: course.kind,
      tag: course.tag,
      title: course.title,
      topics: course.topics,
      price: course.price,
      period: course.period,
      startDate: course.startDate ?? "",
      mode: course.mode ?? "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const saveCourse = async () => {
    if (!form.tag.trim() || !form.title.trim() || !form.price.trim() || !form.period.trim()) {
      setFormError("Заавал бөглөх талбаруудыг бөглөнө үү");
      return;
    }
    setFormError(null);
    const url = editingId ? `/api/admin/courses/${editingId}` : "/api/admin/courses";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) {
      setFormError(json.error ?? "Хадгалахад алдаа гарлаа");
      return;
    }
    if (editingId) {
      setCourses((cs) => cs.map((c) => (c.id === editingId ? json.course : c)));
    } else {
      setCourses((cs) => [...cs, json.course]);
    }
    setShowForm(false);
  };

  const removeCourse = async (id: string) => {
    if (!confirm("Энэ сургалтыг устгах уу?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/courses/${id}`, { method: "DELETE" });
      if (res.ok) setCourses((cs) => cs.filter((c) => c.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const upcoming = courses.filter((c) => c.kind === "upcoming");
  const vod = courses.filter((c) => c.kind === "vod");
  const pendingCount = registrations.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="bg-navy text-white">
        <div className="wrap flex items-center justify-between h-[76px]">
          <b className="font-extrabold text-[1.1rem]">Админ хэсэг</b>
          <button type="button" onClick={logout} className="font-bold text-[.9rem] text-white/80 hover:text-white">
            Гарах
          </button>
        </div>
      </header>

      <div className="wrap py-8">
        <div className="flex gap-2 mb-7">
          <button
            type="button"
            onClick={() => setTab("registrations")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors ${
              tab === "registrations" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Бүртгэлүүд {pendingCount > 0 && `(${pendingCount})`}
          </button>
          <button
            type="button"
            onClick={() => setTab("courses")}
            className={`font-extrabold text-[.95rem] px-5 py-2.5 rounded-full transition-colors ${
              tab === "courses" ? "bg-blue text-white" : "bg-surface text-ink-2"
            }`}
          >
            Сургалтууд
          </button>
        </div>

        {tab === "registrations" && (
          <div className="flex flex-col gap-3">
            {registrations.length === 0 && (
              <p className="text-ink-3 font-semibold text-center py-10">Бүртгэл алга байна.</p>
            )}
            {registrations.map((r) => (
              <div key={r.id} className="bg-surface border border-line rounded-md shadow-xs px-6 py-5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <b className="font-extrabold block">{r.programLabel}</b>
                  <span className="text-ink-3 font-semibold text-[.85rem]">
                    {r.user ? `${r.user.lastName} ${r.user.firstName} · ${r.user.phone}` : "Хэрэглэгч устсан"} ·{" "}
                    {r.payMethod === "qpay" ? "QPay" : "Дансаар"} · {r.price}
                  </span>
                </div>
                {r.status === "active" ? (
                  <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
                    <IconCheckCircle className="w-3.5 h-3.5" /> Идэвхтэй
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => approve(r.id)}
                    className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-gold-strong px-4 py-2 rounded-full disabled:opacity-50"
                  >
                    <IconClock className="w-3.5 h-3.5" /> {busyId === r.id ? "…" : "Баталгаажуулах"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "courses" && (
          <div>
            <CourseGroup
              title="Удахгүй эхлэх сургалтууд"
              courses={upcoming}
              busyId={busyId}
              onAdd={() => startAdd("upcoming")}
              onEdit={startEdit}
              onDelete={removeCourse}
            />
            <div className="mt-10">
              <CourseGroup
                title="Бичлэгээр үзэх сургалтууд"
                courses={vod}
                busyId={busyId}
                onAdd={() => startAdd("vod")}
                onEdit={startEdit}
                onDelete={removeCourse}
              />
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 bg-[rgba(15,20,40,.6)] backdrop-blur-[3px] flex items-center justify-center z-[200] p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div className="bg-surface rounded-lg w-full max-w-[480px] max-h-[88vh] overflow-y-auto shadow-lg px-[26px] py-7">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[1.2rem] font-extrabold">{editingId ? "Сургалт засах" : "Шинэ сургалт"}</h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-bg-soft grid place-items-center"
              >
                <IconClose className="w-3.5 h-3.5 text-ink-2" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <AdminField label="Ангилал тэмдэглэгээ (жишээ: A АНГИЛАЛ СУРАГЧ)">
                <input value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))} />
              </AdminField>
              <AdminField label="Гарчиг">
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </AdminField>
              <AdminField label="Тайлбар">
                <input value={form.topics} onChange={(e) => setForm((f) => ({ ...f, topics: e.target.value }))} />
              </AdminField>
              <div className="grid grid-cols-2 gap-3">
                <AdminField label="Үнэ">
                  <input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="350,000₮" />
                </AdminField>
                <AdminField label="Хугацааны нэгж">
                  <input value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} placeholder="/ сар" />
                </AdminField>
              </div>
              {form.kind === "upcoming" && (
                <div className="grid grid-cols-2 gap-3">
                  <AdminField label="Хичээллэх өдөр">
                    <input value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} placeholder="2026.08.10" />
                  </AdminField>
                  <AdminField label="Төрөл">
                    <input value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} placeholder="Онлайн" />
                  </AdminField>
                </div>
              )}
            </div>

            {formError && <p className="text-[.85rem] font-semibold text-red-soft mt-3">{formError}</p>}

            <button
              type="button"
              onClick={saveCourse}
              className="w-full mt-6 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5"
            >
              Хадгалах
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CourseGroup({
  title,
  courses,
  busyId,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  courses: Course[];
  busyId: string | null;
  onAdd: () => void;
  onEdit: (c: Course) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[1.15rem] font-extrabold">{title}</h2>
        <button
          type="button"
          onClick={onAdd}
          className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2 rounded-full"
        >
          + Сургалт нэмэх
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {courses.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Одоогоор алга.</p>}
        {courses.map((c) => (
          <div key={c.id} className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="text-[.72rem] font-extrabold tracking-[.08em] uppercase text-blue-strong">{c.tag}</span>
              <b className="font-extrabold block">{c.title}</b>
              <span className="text-ink-3 font-semibold text-[.85rem]">
                {c.price} {c.period}
                {c.startDate && ` · ${c.startDate}`}
                {c.mode && ` · ${c.mode}`}
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onEdit(c)} className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full">
                Засах
              </button>
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => onDelete(c.id)}
                className="text-[.82rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3.5 py-2 rounded-full disabled:opacity-50"
              >
                Устгах
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[.85rem] font-extrabold text-ink mb-1.5">{label}</label>
      <div className="[&>input]:w-full [&>input]:px-3.5 [&>input]:py-3 [&>input]:rounded-xs [&>input]:border-[1.5px] [&>input]:border-line-2 [&>input]:bg-surface-2 [&>input]:text-ink [&>input]:font-semibold [&>input:focus]:outline-none [&>input:focus]:border-blue [&>input:focus]:bg-surface">
        {children}
      </div>
    </div>
  );
}
