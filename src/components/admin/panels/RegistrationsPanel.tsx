"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicUser, Registration, RegistrationPayment } from "@/lib/db";
import type { RegistrationPaymentIntent } from "@/lib/paymentIntents";
import { IconCalendar, IconCheckCircle, IconClock, IconClose } from "@/components/icons";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { formatDateTimeUb, ubDay } from "@/lib/dateFormat";
import { formatMnt } from "@/lib/price";
import {
  paidLabel,
  payMethodLabel,
  programAdminHref,
  registrationBalance,
  sumPaymentsFor,
} from "@/lib/registration";
import { compareMn } from "@/lib/sortMn";
import PendingRegistrationActions from "@/components/admin/PendingRegistrationActions";
import PendingIntentActions from "@/components/admin/PendingIntentActions";

type RegistrationWithUser = Registration & { user?: PublicUser };

/** One card in the list: a registration, or a balance payment a family started on one. */
type Entry =
  | { kind: "registration"; at: string; registration: RegistrationWithUser }
  | { kind: "intent"; at: string; registration: RegistrationWithUser; intent: RegistrationPaymentIntent };

/** One vocabulary for both kinds of card: waiting on the admin, settled, or dropped. */
type Stage = "pending" | "done" | "cancelled";

function stageOf(entry: Entry): Stage {
  const status = entry.kind === "intent" ? entry.intent.status : entry.registration.status;
  if (status === "pending") return "pending";
  if (status === "cancelled") return "cancelled";
  return "done";
}

function methodOf(entry: Entry): string {
  return entry.kind === "intent" ? entry.intent.method : entry.registration.payMethod;
}

function methodLabel(entry: Entry): string {
  return entry.kind === "intent"
    ? entry.intent.method === "qpay"
      ? "QPay"
      : "Дансаар"
    : payMethodLabel(entry.registration.payMethod);
}

function statusLabel(entry: Entry): string {
  const stage = stageOf(entry);
  if (stage === "pending") return "Хүлээгдэж буй";
  if (stage === "cancelled") return "Цуцалсан";
  return entry.kind === "intent" ? "Төлөгдсөн" : "Идэвхтэй";
}

const STAGES: [Stage | "", string][] = [
  ["", "Бүгд"],
  ["pending", "Хүлээгдэж буй"],
  ["done", "Баталгаажсан"],
  ["cancelled", "Цуцалсан"],
];

const PILL = "inline-flex items-center gap-1.5 text-[.82rem] font-extrabold px-3 py-1.5 rounded-full";
// Narrower padding than the other fields: two dates share one row on a phone.
const DATE_INPUT_CLASS = `${INPUT_CLASS.replace("px-3.5", "px-2")} min-w-0`;

function Who({ registration: r }: { registration: RegistrationWithUser }) {
  if (r.user) {
    return (
      <Link href={`/admin/users/${r.user.id}`} className="hover:text-blue-strong hover:underline">
        {r.user.lastName} {r.user.firstName} · {r.user.phone}
      </Link>
    );
  }
  return <>{r.phone ? `Бүртгэл хүлээгдэж буй · ${r.phone}` : "Хэрэглэгч устсан"}</>;
}

/** When the card was made, in Ulaanbaatar time; a paid balance payment also says when it was booked. */
function When({ entry }: { entry: Entry }) {
  const paidAt = entry.kind === "intent" && entry.intent.status === "paid" ? entry.intent.paidAt : undefined;
  return (
    <span className="flex items-center gap-1.5 text-[.78rem] font-bold text-ink-3 mb-0.5">
      <IconCalendar className="w-3.5 h-3.5" />
      {formatDateTimeUb(entry.at)}
      {paidAt && ` · ${formatDateTimeUb(paidAt).slice(0, 10)}-нд төлөгдсөн`}
    </span>
  );
}

/** The registrations tab as its own route component — approve/cancel state used to live in the dashboard parent. */
export default function RegistrationsPanel({
  initialRegistrations,
  payments: initialPayments = [],
  intents: initialIntents = [],
  canEdit,
}: {
  initialRegistrations: RegistrationWithUser[];
  /** Бодит төлөлтүүд — хуваан төлсөн мөрөнд "төлсөн / нийт" харуулна. */
  payments?: RegistrationPayment[];
  /**
   * «Үлдэгдэл төлөх»-өөр гэр бүлийн эхлүүлсэн төлөлтүүд. Шинэ бүртгэлтэй адил
   * карт болж огноогоороо холилдоно — дансаар шилжүүлснээ мэдэгдсэн гэр бүл
   * өмнө нь админы хаана ч харагддаггүй байсан.
   */
  intents?: RegistrationPaymentIntent[];
  // The read-only admin sees the same list and filters without the action
  // buttons. Cosmetic only — the endpoints check the role themselves.
  canEdit: boolean;
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [payments, setPayments] = useState(initialPayments);
  const [intents, setIntents] = useState(initialIntents);
  const [busyId, setBusyId] = useState<string | null>(null);

  // One box searches name, phone and programme at once, like the users tab.
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"" | Entry["kind"]>("");
  const [stage, setStage] = useState<Stage | "">("");
  const [method, setMethod] = useState("");
  const [program, setProgram] = useState("");
  const [balance, setBalance] = useState<"" | "owing" | "settled">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const patchRegistration = (id: string, patch: Partial<Registration>) => {
    setRegistrations((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const patchIntent = (id: string, patch: Partial<RegistrationPaymentIntent>) => {
    setIntents((is) => is.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  /** A registration's payments as the server now has them, after an action booked one. */
  const replacePayments = (registrationId: string, fresh: RegistrationPayment[]) => {
    setPayments((ps) => [...ps.filter((p) => p.registrationId !== registrationId), ...fresh]);
  };

  // Newest first across both kinds, so a family's «I paid» lands at the top
  // the way a new registration does.
  const entries = useMemo(() => {
    const byId = new Map(registrations.map((r) => [r.id, r]));
    const list: Entry[] = registrations.map((r) => ({ kind: "registration", at: r.createdAt, registration: r }));
    for (const intent of intents) {
      const registration = byId.get(intent.registrationId);
      if (registration) list.push({ kind: "intent", at: intent.createdAt, registration, intent });
    }
    return list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [registrations, intents]);

  const balanceById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of registrations) map.set(r.id, registrationBalance(r, sumPaymentsFor(r.id, payments)).balance);
    return map;
  }, [registrations, payments]);

  const programs = useMemo(() => {
    const byId = new Map<string, { label: string; count: number }>();
    for (const r of registrations) {
      const entry = byId.get(r.programId) ?? { label: r.programLabel, count: 0 };
      entry.count += 1;
      byId.set(r.programId, entry);
    }
    // compareMn, not localeCompare: rendered on both sides (see lib/sortMn.ts).
    return [...byId].sort((a, b) => compareMn(a[1].label, b[1].label));
  }, [registrations]);

  // Every filter but the status chips, so each chip can say how many it would show.
  const base = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((e) => {
      const r = e.registration;
      if (words.length > 0) {
        // Word by word, so «Болд Бат» finds «Бат Болд».
        const haystack = [r.user?.lastName, r.user?.firstName, r.user?.phone, r.phone, r.programLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!words.every((w) => haystack.includes(w))) return false;
      }
      if (kind && e.kind !== kind) return false;
      if (method && methodOf(e) !== method) return false;
      if (program && r.programId !== program) return false;
      if (balance) {
        // A pending or cancelled seat owes nothing yet — only an active one has a balance.
        if (r.status !== "active") return false;
        const owes = (balanceById.get(r.id) ?? 0) > 0;
        if (balance === "owing" ? !owes : owes) return false;
      }
      if (from || to) {
        const day = ubDay(e.at);
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      return true;
    });
  }, [entries, query, kind, method, program, balance, from, to, balanceById]);

  const counts = useMemo(() => {
    const c: Record<Stage | "", number> = { "": base.length, pending: 0, done: 0, cancelled: 0 };
    for (const e of base) c[stageOf(e)] += 1;
    return c;
  }, [base]);

  const visible = stage ? base.filter((e) => stageOf(e) === stage) : base;
  const filtering = Boolean(query || kind || stage || method || program || balance || from || to);

  const clearFilters = () => {
    setQuery("");
    setKind("");
    setStage("");
    setMethod("");
    setProgram("");
    setBalance("");
    setFrom("");
    setTo("");
  };

  /** The list as filtered, as a spreadsheet — what the admin would otherwise retype. */
  const downloadCsv = () => {
    const header = [
      "Огноо", "Төрөл", "Сургалт", "Овог", "Нэр", "Утас", "Төлбөрийн арга",
      "Төлөлтийн дүн", "Нийт төлсөн", "Нийт төлөх", "Үлдэгдэл", "Төлөв",
    ];
    const rows = visible.map((e) => {
      const r = e.registration;
      const { due, paid, balance: owed } = registrationBalance(r, sumPaymentsFor(r.id, payments));
      return [
        formatDateTimeUb(e.at),
        e.kind === "intent" ? "Үлдэгдэл төлөлт" : "Бүртгэл",
        r.programLabel,
        r.user?.lastName ?? "",
        r.user?.firstName ?? "",
        r.user?.phone ?? r.phone ?? "",
        methodLabel(e),
        e.kind === "intent" ? String(e.intent.amount) : "",
        String(paid),
        String(due),
        String(owed),
        statusLabel(e),
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    // BOM so Excel opens Cyrillic correctly rather than as mojibake.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `burtgel-${ubDay(new Date().toISOString())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // For a QPay checkout the student abandoned, or one that simply never got
  // paid — clears it out of the queue instead of leaving it stuck forever,
  // and voids the QPay invoice so a stale QR can't move money later against
  // a registration that no longer exists on our side.
  const cancelRegistration = async (id: string) => {
    if (!confirm("Энэ бүртгэлийг цуцлах уу? QPay-ийн нэхэмжлэл хүчингүй болж, бүртгэл «Цуцалсан» болно.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}/cancel`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        patchRegistration(id, { status: "cancelled" });
      } else if (json.paid) {
        // Lost the race with the student's own payment — reflect reality
        // instead of leaving a stale "pending" row in view.
        setRegistrations((rs) => rs.map((r) => (r.id === id ? { ...r, status: "active" } : r)));
      } else {
        alert(json.error ?? "Цуцлахад алдаа гарлаа");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-4">
        <div className="grid grid-cols-2 nav:grid-cols-6 gap-3">
          <input
            type="search"
            placeholder="Нэр, утас, сургалтаар хайх"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${INPUT_CLASS} col-span-2`}
          />
          <select value={program} onChange={(e) => setProgram(e.target.value)} className={`${INPUT_CLASS} col-span-2`}>
            <option value="">Бүх сургалт</option>
            {programs.map(([id, p]) => (
              <option key={id} value={id}>
                {`${p.label} · ${p.count}`}
              </option>
            ))}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as "" | Entry["kind"])} className={INPUT_CLASS}>
            <option value="">Бүх төрөл</option>
            <option value="registration">Бүртгэл</option>
            <option value="intent">Үлдэгдэл төлөлт</option>
          </select>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT_CLASS}>
            <option value="">Төлбөр: бүгд</option>
            <option value="qpay">QPay</option>
            <option value="bank">Дансаар</option>
            <option value="manual">Гараар нэмсэн</option>
          </select>
          <select
            value={balance}
            onChange={(e) => setBalance(e.target.value as "" | "owing" | "settled")}
            className={`${INPUT_CLASS} col-span-2`}
          >
            <option value="">Үлдэгдэл: бүгд</option>
            <option value="owing">Үлдэгдэлтэй</option>
            <option value="settled">Бүрэн төлсөн</option>
          </select>
          <div className="col-span-2 nav:col-span-4 flex items-center gap-2">
            <span className="hidden xs:inline text-[.8rem] font-extrabold text-ink-3 shrink-0">Огноо</span>
            <input
              type="date"
              aria-label="Эхлэх огноо"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
            <span className="text-ink-3 font-bold">–</span>
            <input
              type="date"
              aria-label="Дуусах огноо"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            {STAGES.map(([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                onClick={() => setStage(value)}
                className={`text-[.82rem] font-extrabold px-3.5 py-1.5 rounded-full transition-colors ${
                  stage === value ? "bg-blue text-white" : "bg-bg-soft text-ink-2"
                }`}
              >
                {label} ({counts[value]})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {filtering && (
              <button type="button" onClick={clearFilters} className="text-[.82rem] font-extrabold text-ink-3">
                Шүүлтүүр цэвэрлэх
              </button>
            )}
            <button
              type="button"
              onClick={downloadCsv}
              disabled={visible.length === 0}
              className="text-[.82rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-1.5 rounded-full disabled:opacity-50"
            >
              Excel-д татах
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {visible.length === 0 && (
          <p className="text-ink-3 font-semibold text-center py-10">
            {entries.length === 0 ? "Бүртгэл алга байна." : "Тохирох бүртгэл алга байна."}
          </p>
        )}
        {visible.map((entry) => {
          const r = entry.registration;
          if (entry.kind === "intent") {
            const intent = entry.intent;
            return (
              <div
                key={`intent-${intent.id}`}
                className="bg-surface border border-line rounded-md shadow-xs px-6 py-5 flex items-center justify-between flex-wrap gap-4"
              >
                <div>
                  <When entry={entry} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={programAdminHref(r.programId)}
                      className="font-extrabold hover:text-blue-strong hover:underline"
                    >
                      {r.programLabel}
                    </Link>
                    <span className="text-[.72rem] font-extrabold text-blue-strong bg-blue-soft px-2 py-0.5 rounded-full">
                      Үлдэгдэл төлөлт
                    </span>
                  </div>
                  <span className="text-ink-3 font-semibold text-[.85rem]">
                    <Who registration={r} /> · {methodLabel(entry)} · {formatMnt(intent.amount)} · нийт төлсөн{" "}
                    {paidLabel(r, payments)}
                  </span>
                </div>
                {intent.status === "paid" ? (
                  <span className={`${PILL} text-green bg-green-soft`}>
                    <IconCheckCircle className="w-3.5 h-3.5" /> Төлөгдсөн
                  </span>
                ) : intent.status === "cancelled" ? (
                  <span className={`${PILL} text-ink-3 bg-bg-soft`}>
                    <IconClose className="w-3.5 h-3.5" /> Цуцалсан
                  </span>
                ) : !canEdit ? (
                  <span className={`${PILL} text-gold-strong bg-gold-soft`}>
                    <IconClock className="w-3.5 h-3.5" /> Хүлээгдэж буй
                  </span>
                ) : (
                  <PendingIntentActions
                    intent={intent}
                    onDone={(patch, fresh) => {
                      patchIntent(intent.id, patch);
                      if (fresh) replacePayments(intent.registrationId, fresh);
                    }}
                  />
                )}
              </div>
            );
          }
          return (
            <div
              key={r.id}
              className="bg-surface border border-line rounded-md shadow-xs px-6 py-5 flex items-center justify-between flex-wrap gap-4"
            >
              <div>
                <When entry={entry} />
                <Link
                  href={programAdminHref(r.programId)}
                  className="font-extrabold block hover:text-blue-strong hover:underline"
                >
                  {r.programLabel}
                </Link>
                <span className="text-ink-3 font-semibold text-[.85rem]">
                  <Who registration={r} /> · {payMethodLabel(r.payMethod)} · {paidLabel(r, payments)}
                </span>
              </div>
              {r.status === "active" ? (
                <span className={`${PILL} text-green bg-green-soft`}>
                  <IconCheckCircle className="w-3.5 h-3.5" /> Идэвхтэй
                </span>
              ) : r.status === "cancelled" ? (
                <span className={`${PILL} text-ink-3 bg-bg-soft`}>
                  <IconClose className="w-3.5 h-3.5" /> Цуцалсан
                </span>
              ) : !canEdit ? (
                <span className={`${PILL} text-gold-strong bg-gold-soft`}>
                  <IconClock className="w-3.5 h-3.5" /> Хүлээгдэж буй
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => cancelRegistration(r.id)}
                    className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-ink-2 bg-bg-soft px-4 py-2 rounded-full disabled:opacity-50"
                  >
                    <IconClose className="w-3.5 h-3.5" /> Цуцлах
                  </button>
                  <PendingRegistrationActions
                    registration={r}
                    onDone={(patch, payment) => {
                      patchRegistration(r.id, patch);
                      // The money just entered, or «paid / due» keeps reading 0₮.
                      if (payment) setPayments((ps) => [...ps, payment]);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
