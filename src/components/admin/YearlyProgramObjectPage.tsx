"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Lesson, PublicUser, Registration, RegistrationPayment, YearlyProgram } from "@/lib/db";
import { IconBank, IconPerson, IconQrCode } from "@/components/icons";
import { formatMnt, parsePriceToNumber } from "@/lib/price";
import { payMethodLabel } from "@/lib/registration";
import AdminField from "./AdminField";
import { AnchorTab, Card, KpiTile } from "./AdminObjectPageParts";
import LessonScheduleEditor from "./LessonScheduleEditor";
import RegistrationRoster from "./RegistrationRoster";

type RegistrationWithUser = Registration & { user?: PublicUser };
type SectionTab = "info" | "roster" | "confirm" | "report";

export default function YearlyProgramObjectPage({
  program,
  initialRegistrations,
  initialPayments,
}: {
  program: YearlyProgram;
  initialRegistrations: RegistrationWithUser[];
  initialPayments: RegistrationPayment[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<SectionTab>("info");
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [payments, setPayments] = useState(initialPayments);
  const [busyRegId, setBusyRegId] = useState<string | null>(null);

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
    showOnHomepage: program.showOnHomepage,
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

  const approve = async (id: string) => {
    setBusyRegId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}/approve`, { method: "POST" });
      if (res.ok) {
        setRegistrations((rs) => rs.map((r) => (r.id === id ? { ...r, status: "active" } : r)));
      }
    } finally {
      setBusyRegId(null);
    }
  };

  const pending = registrations.filter((r) => r.status === "pending");
  const active = registrations.filter((r) => r.status === "active");
  const totalRevenue = active.reduce((sum, r) => sum + parsePriceToNumber(r.price), 0);
  const qpayCount = registrations.filter((r) => r.payMethod === "qpay").length;
  const bankCount = registrations.filter((r) => r.payMethod === "bank").length;
  const manualCount = registrations.filter((r) => r.payMethod === "manual").length;

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

        <div className="wrap flex gap-1 overflow-x-auto">
          <AnchorTab label="Үндсэн мэдээлэл" active={tab === "info"} onClick={() => setTab("info")} />
          <AnchorTab
            label={`Бүртгэл${registrations.length ? ` (${registrations.length})` : ""}`}
            active={tab === "roster"}
            onClick={() => setTab("roster")}
          />
          <AnchorTab
            label={`Баталгаажуулалт${pending.length ? ` (${pending.length})` : ""}`}
            active={tab === "confirm"}
            onClick={() => setTab("confirm")}
          />
          <AnchorTab label="Тайлан" active={tab === "report"} onClick={() => setTab("report")} />
        </div>
      </header>

      <div className="wrap max-w-[880px] py-8">
        {error && (
          <p className="bg-[oklch(0.97_0.03_25)] text-red-soft font-semibold text-[.9rem] rounded-md px-4 py-3 mb-5">
            {error}
          </p>
        )}

        {tab === "info" && (
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
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.showOnHomepage}
                    onChange={(e) => setForm((f) => ({ ...f, showOnHomepage: e.target.checked }))}
                  />
                  <span className="text-[.87rem] font-bold text-ink-2">Нүүр хуудсанд харуулах</span>
                </label>
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
          </div>
        )}

        {tab === "roster" && (
          <Card title={`Бүртгүүлсэн сурагчид (${registrations.length})`}>
            <RegistrationRoster
              programId={program.id}
              registrations={registrations}
              onChange={setRegistrations}
              trackPayments
              payments={payments}
              onPaymentsChange={setPayments}
            />
          </Card>
        )}

        {tab === "confirm" && (
          <div className="flex flex-col gap-5">
            <Card title={`Хүлээгдэж буй төлбөр (${pending.length})`}>
              {pending.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Хүлээгдэж буй бүртгэл алга.</p>}
              <div className="flex flex-col gap-2.5">
                {pending.map((r) => (
                  <div
                    key={r.id}
                    className="bg-bg-soft rounded-md px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div>
                      {r.user ? (
                        <Link
                          href={`/admin/users/${r.user.id}`}
                          className="font-extrabold block text-[.92rem] hover:text-blue-strong hover:underline"
                        >
                          {r.user.lastName} {r.user.firstName}
                        </Link>
                      ) : (
                        <b className="font-extrabold block text-[.92rem]">Хэрэглэгч устсан</b>
                      )}
                      <span className="text-ink-3 font-semibold text-[.82rem] inline-flex items-center gap-1.5">
                        {r.payMethod === "qpay" ? <IconQrCode className="w-3.5 h-3.5" /> : <IconBank className="w-3.5 h-3.5" />}
                        {payMethodLabel(r.payMethod)} · {r.price}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busyRegId === r.id}
                      onClick={() => approve(r.id)}
                      className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-gold-strong px-4 py-2 rounded-full disabled:opacity-50"
                    >
                      {busyRegId === r.id ? "…" : "Баталгаажуулах"}
                    </button>
                  </div>
                ))}
              </div>
            </Card>

            <Card title={`Баталгаажсан төлбөр (${active.length})`}>
              {active.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Баталгаажсан бүртгэл алга.</p>}
              <div className="flex flex-col gap-2">
                {active.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-4 flex-wrap py-2 border-b border-line last:border-0">
                    {r.user ? (
                      <Link href={`/admin/users/${r.user.id}`} className="font-bold text-[.88rem] text-ink-2 hover:text-blue-strong hover:underline">
                        {r.user.lastName} {r.user.firstName}
                      </Link>
                    ) : (
                      <span className="font-bold text-[.88rem] text-ink-2">Хэрэглэгч устсан</span>
                    )}
                    <span className="text-ink-3 font-semibold text-[.82rem]">
                      {payMethodLabel(r.payMethod)} · {r.price} · {new Date(r.createdAt).toLocaleDateString("mn-MN")}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "report" && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 nav:grid-cols-4 gap-3.5">
              <KpiTile label="Нийт бүртгэл" value={String(registrations.length)} />
              <KpiTile label="Идэвхтэй" value={String(active.length)} tone="green" />
              <KpiTile label="Хүлээгдэж буй" value={String(pending.length)} tone="gold" />
              <KpiTile label="Нийт орлого" value={formatMnt(totalRevenue)} tone="blue" />
            </div>
            <Card title="Төлбөрийн хэлбэрээр">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between py-2 border-b border-line">
                  <span className="font-bold text-[.9rem] text-ink-2 inline-flex items-center gap-1.5">
                    <IconQrCode className="w-3.5 h-3.5" /> QPay
                  </span>
                  <b className="font-extrabold">{qpayCount}</b>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-line">
                  <span className="font-bold text-[.9rem] text-ink-2 inline-flex items-center gap-1.5">
                    <IconBank className="w-3.5 h-3.5" /> Дансаар
                  </span>
                  <b className="font-extrabold">{bankCount}</b>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="font-bold text-[.9rem] text-ink-2 inline-flex items-center gap-1.5">
                    <IconPerson className="w-3.5 h-3.5" /> Гараар нэмсэн
                  </span>
                  <b className="font-extrabold">{manualCount}</b>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
