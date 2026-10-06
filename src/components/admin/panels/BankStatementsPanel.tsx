"use client";

import { useMemo, useRef, useState } from "react";
import { IconBank, IconCheckCircle, IconClose } from "@/components/icons";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { formatMnt } from "@/lib/price";
import { apiError, readJson } from "@/lib/fetchJson";
import type { BankStatement, BankTransaction, BankTransactionStatus, RosterEntry } from "@/lib/bankStatement/db";

type Tab = BankTransactionStatus | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "review", label: "Шалгах" },
  { key: "ready", label: "Бэлэн" },
  { key: "approved", label: "Батлагдсан" },
  { key: "skipped", label: "Алгассан" },
  { key: "all", label: "Бүгд" },
];

const STATUS_BADGE: Record<BankTransactionStatus, { label: string; cls: string }> = {
  review: { label: "Шалгах", cls: "text-gold-strong bg-gold-soft" },
  ready: { label: "Бэлэн", cls: "text-blue-strong bg-blue-soft" },
  approved: { label: "Батлагдсан", cls: "text-green bg-green-soft" },
  skipped: { label: "Алгассан", cls: "text-ink-3 bg-bg-soft" },
};

const SOURCE_LABEL: Record<string, string> = {
  phone: "Утсаар",
  name: "Нэрээр",
  ai: "AI",
  admin: "Админ",
  qpay: "QPay",
  rule: "Дүрэм",
  intent: "Мэдэгдлээр",
};

const MAX_UPLOAD_BYTES = 4_000_000;
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "YYYY.MM.DD HH:MM" in Ulaanbaatar — computed, not locale-formatted, so server and browser agree. */
function ubDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) + UB_OFFSET_MS).toISOString();
  return `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)} ${d.slice(11, 16)}`;
}

function ubDay(iso: string): string {
  const d = new Date(Date.parse(iso) + UB_OFFSET_MS).toISOString();
  return `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
}

export default function BankStatementsPanel({
  initialStatements,
  initialTransactions,
  roster: initialRoster,
}: {
  initialStatements: BankStatement[];
  initialTransactions: BankTransaction[];
  roster: RosterEntry[];
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [statements, setStatements] = useState(initialStatements);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [tab, setTab] = useState<Tab>(initialTransactions.some((t) => t.status === "review") ? "review" : "all");
  const [statementId, setStatementId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<{ text: string; warnings: string[] } | null>(null);
  const [aiRunning, setAiRunning] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveNote, setApproveNote] = useState<{ text: string; failed: string[] } | null>(null);
  const [approveProgress, setApproveProgress] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const byRegistration = useMemo(() => new Map(roster.map((r) => [r.registrationId, r])), [roster]);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { review: 0, ready: 0, approved: 0, skipped: 0, all: transactions.length };
    for (const t of transactions) c[t.status]++;
    return c;
  }, [transactions]);
  // Oldest first: approvals run in that order, so an earlier transfer is the one recorded first.
  const ready = useMemo(
    () =>
      transactions
        .filter((t) => t.status === "ready" && t.registrationId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    [transactions]
  );
  const readyTotal = ready.reduce((s, t) => s + t.amount, 0);
  const readyActivations = new Set(
    ready.filter((t) => byRegistration.get(t.registrationId!)?.status === "pending").map((t) => t.registrationId)
  ).size;
  /** Registrations whose ready transfers add up to more than they still owe. */
  const overAllotted = useMemo(() => {
    const sums = new Map<string, number>();
    for (const t of ready) sums.set(t.registrationId!, (sums.get(t.registrationId!) ?? 0) + t.amount);
    const out = new Map<string, number>();
    for (const [id, sum] of sums) {
      const r = byRegistration.get(id);
      if (r && sum > r.balance + 1) out.set(id, sum);
    }
    return out;
  }, [ready, byRegistration]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/[^\d]/g, "");
    return transactions.filter((t) => {
      if (tab !== "all" && t.status !== tab) return false;
      if (statementId && t.statementId !== statementId) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (!q) return true;
      const linked = t.registrationId ? byRegistration.get(t.registrationId) : undefined;
      return (
        t.description.toLowerCase().includes(q) ||
        (linked && `${linked.name} ${linked.phone} ${linked.programLabel}`.toLowerCase().includes(q)) ||
        (digits.length >= 3 && String(Math.round(t.amount)).includes(digits))
      );
    });
  }, [transactions, tab, statementId, from, to, query, byRegistration]);

  const pickerMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const list = q
      ? roster.filter((r) => `${r.name} ${r.phone} ${r.programLabel}`.toLowerCase().includes(q))
      : roster.filter((r) => r.status === "pending" || r.balance > 0);
    return list.slice(0, 8);
  }, [pickerQuery, roster]);

  function patchRows(rows: BankTransaction[]) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    setTransactions((list) => list.map((t) => byId.get(t.id) ?? t));
  }

  /** Rows, statements and the roster's balances, all from the server together. */
  async function reload() {
    try {
      const res = await fetch("/api/admin/statements");
      const json = await readJson<{ statements: BankStatement[]; transactions: BankTransaction[]; roster: RosterEntry[] }>(res);
      if (res.ok && json.statements && json.transactions && json.roster) {
        setStatements(json.statements);
        setTransactions(json.transactions);
        setRoster(json.roster);
      }
    } catch {
      // The rows on screen stay; the next action reloads again.
    }
  }

  /** Pages the AI through every transfer of the statement it has not looked at yet. */
  async function runAi(id: string) {
    setAiRunning(id);
    setAiNote(null);
    let suggested = 0;
    let offered = 0;
    try {
      let remaining = 0;
      for (let round = 0; round < 50; round++) {
        const res = await fetch(`/api/admin/statements/${id}/suggest`, { method: "POST" });
        const json = await readJson<{
          transactions: BankTransaction[];
          suggested: number;
          offered: number;
          remaining: number;
          aiUnavailable?: boolean;
        }>(res);
        const done = offered > 0 ? `AI ${offered} гүйлгээг шалгаад ${suggested}-д нь санал гаргалаа. ` : "";
        if (!res.ok) {
          setAiNote(`${done}${apiError(res, json, "AI санал авахад алдаа гарлаа")}`);
          return;
        }
        if (json.aiUnavailable) {
          setAiNote(`${done}AI одоогоор ажиллахгүй байна — үлдсэн ${json.remaining ?? 0} гүйлгээг гараар холбох эсвэл дараа дахин оролдоно уу.`);
          return;
        }
        if (json.transactions) patchRows(json.transactions);
        suggested += json.suggested ?? 0;
        offered += json.offered ?? 0;
        remaining = json.remaining ?? 0;
        if (!remaining) break;
      }
      setAiNote(
        offered === 0
          ? "AI-д шалгуулах шинэ гүйлгээ алга."
          : `AI ${offered} гүйлгээг шалгаад ${suggested}-д нь санал гаргалаа.` +
              (remaining ? ` ${remaining} гүйлгээ үлдсэн — «AI санал авах»-ыг дахин дарна уу.` : "")
      );
    } catch {
      setAiNote("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setAiRunning(null);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setUploadNote(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Файл 4MB-аас ихгүй байх ёстой");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/statements", { method: "POST", body });
      const json = await readJson<{ statement: BankStatement; inserted: number; duplicates: number; warnings: string[] }>(res);
      if (!res.ok || !json.statement) {
        setError(apiError(res, json, "Хуулга оруулахад алдаа гарлаа"));
        return;
      }
      setUploadNote({
        text: `«${json.statement.fileName}»: ${json.inserted ?? 0} шинэ гүйлгээ${
          json.duplicates ? `, ${json.duplicates} нь өмнөх хуулгаар орсон тул алгассан` : ""
        }.`,
        warnings: json.warnings ?? [],
      });
      await reload();
      setTab("review");
      setStatementId("");
      if ((json.inserted ?? 0) > 0) await runAi(json.statement.id);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function setRowError(id: string, message: string | null) {
    setRowErrors((all) => {
      const next = { ...all };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  async function act(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setRowError(id, null);
    try {
      const res = await fetch(`/api/admin/bank-transactions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await readJson<{ transaction: BankTransaction }>(res);
      if (!res.ok || !json.transaction) {
        const message = apiError(res, json, "Хадгалахад алдаа гарлаа");
        setRowError(id, message);
        if (res.status === 409) {
          // The row may leave this tab on reload — say it where it stays visible.
          setError(message);
          await reload();
        }
        return;
      }
      patchRows([json.transaction]);
      setPickerFor(null);
      setPickerQuery("");
    } catch {
      setRowError(id, "Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Sends the ready rows ten at a time, so no request runs into the server's
   * time limit; rows the server did not reach come back and are sent again.
   */
  async function approve() {
    setApproving(true);
    setError(null);
    setApproveNote(null);
    let queue = ready.map((t) => t.id);
    const total = queue.length;
    let approved = 0;
    let activated = 0;
    const failed: string[] = [];
    const describe = (id: string) => {
      const t = transactions.find((x) => x.id === id);
      return t ? `${ubDay(t.occurredAt)} ${formatMnt(t.amount)}` : id;
    };
    try {
      let stalled = 0;
      while (queue.length > 0 && stalled < 3) {
        const batch = queue.slice(0, 10);
        setApproveProgress(`${total - queue.length} / ${total}`);
        const res = await fetch("/api/admin/bank-transactions/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: batch }),
        });
        const json = await readJson<{
          approved: number;
          activated: number;
          failed: { id: string; error: string }[];
          notProcessed: string[];
          transactions: BankTransaction[];
        }>(res);
        if (!res.ok) {
          setError(apiError(res, json, "Батлахад алдаа гарлаа"));
          break;
        }
        if (json.transactions) patchRows(json.transactions);
        approved += json.approved ?? 0;
        activated += json.activated ?? 0;
        for (const f of json.failed ?? []) failed.push(`${describe(f.id)}: ${f.error}`);
        const again = new Set(json.notProcessed ?? []);
        stalled = again.size === batch.length ? stalled + 1 : 0;
        queue = [...queue.slice(batch.length), ...batch.filter((id) => again.has(id))];
      }
      if (queue.length > 0) failed.push(`${queue.length} гүйлгээ амжиж бүртгэгдсэнгүй — «Батлах»-ыг дахин дарна уу`);
    } catch {
      setError("Сүлжээний алдаа гарлаа — хуудас шинэчлэгдлээ, үлдсэнийг дахин батлана уу.");
    } finally {
      setApproveNote({
        text: `${approved} төлбөр бүртгэгдлээ${activated ? `, ${activated} хүлээгдэж буй бүртгэл идэвхжиж гэр бүлд SMS очлоо` : ""}.`,
        failed,
      });
      setApproveProgress(null);
      setConfirming(false);
      setApproving(false);
      await reload();
    }
  }

  const filtersOn = Boolean(statementId || from || to || query);

  return (
    <div className="flex flex-col gap-4">
      {/* Upload */}
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <b className="font-extrabold text-[1rem] block">Хуулга оруулах</b>
            <span className="text-ink-3 font-semibold text-[.85rem]">
              Хаан банкны интернэт банкнаас татсан «Депозит дансны дэлгэрэнгүй хуулга» (.xlsx). Давхцсан хуулга
              оруулахад өмнө орсон гүйлгээ дахин орохгүй.
            </span>
          </div>
          <label
            className={`inline-flex items-center gap-2 font-extrabold text-[.85rem] text-white bg-blue rounded-full px-5 py-2.5 cursor-pointer ${
              uploading ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <IconBank className="w-4 h-4" /> {uploading ? "Уншиж байна…" : "Хуулга сонгох"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
        </div>
        {uploadNote && (
          <div className="mt-3 text-[.88rem] font-semibold text-ink-2">
            <p>{uploadNote.text}</p>
            {uploadNote.warnings.map((w) => (
              <p key={w} className="mt-1.5 text-gold-strong bg-gold-soft rounded-sm px-3 py-2">
                {w}
              </p>
            ))}
          </div>
        )}
        {aiRunning ? (
          <p className="mt-3 text-[.85rem] font-bold text-blue-strong">
            AI тодорхойгүй гүйлгээнүүдэд хэн болохыг хайж байна…
          </p>
        ) : (
          aiNote && <p className="mt-3 text-[.85rem] font-bold text-ink-2">{aiNote}</p>
        )}
      </div>

      {error && (
        <p className="text-red-soft font-bold text-[.9rem] bg-surface border border-line rounded-md px-4 py-3">{error}</p>
      )}

      {/* Approve bar */}
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[.9rem] font-semibold text-ink-2">
          {ready.length > 0 ? (
            <>
              <b className="text-ink font-extrabold">{ready.length}</b> гүйлгээ батлахад бэлэн —{" "}
              <b className="text-ink font-extrabold">{formatMnt(readyTotal)}</b>
              {readyActivations > 0 && ` · ${readyActivations} хүлээгдэж буй бүртгэл идэвхжинэ`}
            </>
          ) : (
            "Батлахад бэлэн гүйлгээ алга. «Шалгах» дээрх гүйлгээнүүдийг хүүхэдтэй холбоно уу."
          )}
        </div>
        <button
          type="button"
          disabled={ready.length === 0 || approving}
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 font-extrabold text-[.88rem] text-white bg-blue rounded-full px-6 py-2.5 disabled:opacity-50"
        >
          <IconCheckCircle className="w-4 h-4" /> {approveProgress ? `Бүртгэж байна… ${approveProgress}` : "Батлах"}
        </button>
        {overAllotted.size > 0 && (
          <p className="basis-full text-[.85rem] font-semibold text-gold-strong bg-gold-soft rounded-sm px-3 py-2">
            {overAllotted.size} хүүхдэд бэлэн гүйлгээний нийлбэр үлдэгдлээс нь их байна — тэр мөрүүдийг шалгана уу.
            Батлахад үлдэгдлээс хэтэрсэн гүйлгээ бүртгэгдэхгүй, «Шалгах» руу буцна.
          </p>
        )}
        {approveNote && (
          <div className="basis-full text-[.88rem] font-semibold">
            <p className="text-green">{approveNote.text}</p>
            {approveNote.failed.map((f) => (
              <p key={f} className="text-red-soft mt-1">
                {f}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`font-extrabold text-[.85rem] px-4 py-2 rounded-full ${
                tab === t.key ? "bg-blue text-white" : "bg-bg-soft text-ink-2"
              }`}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 nav:grid-cols-6 gap-3">
          <input
            className={`${INPUT_CLASS} nav:col-span-2`}
            placeholder="Утга, нэр, утас, дүнгээр хайх"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className={`${INPUT_CLASS} nav:col-span-2`} value={statementId} onChange={(e) => setStatementId(e.target.value)}>
            <option value="">Бүх хуулга</option>
            {statements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.periodFrom && s.periodTo ? `${s.periodFrom} – ${s.periodTo}` : s.fileName} ({ubDay(s.createdAt)} оруулсан)
              </option>
            ))}
          </select>
          <input type="date" className={INPUT_CLASS} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Эхлэх огноо" />
          <input type="date" className={INPUT_CLASS} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Дуусах огноо" />
        </div>
        {filtersOn && (
          <button
            type="button"
            onClick={() => {
              setStatementId("");
              setFrom("");
              setTo("");
              setQuery("");
            }}
            className="self-start text-[.85rem] font-extrabold text-blue-strong"
          >
            Шүүлтүүр цэвэрлэх
          </button>
        )}
      </div>

      {/* Transactions */}
      <div className="flex flex-col gap-2.5">
        <b className="text-[.8rem] font-extrabold text-ink-3 uppercase tracking-[.05em]">
          Гүйлгээ ({shown.length}
          {shown.length !== transactions.length && ` / ${transactions.length}`})
        </b>
        {shown.length === 0 ? (
          <p className="text-ink-3 font-semibold text-center py-10 bg-surface border border-line rounded-md">
            {transactions.length === 0 ? "Одоогоор хуулга оруулаагүй байна." : "Энэ шүүлтүүрт гүйлгээ алга."}
          </p>
        ) : (
          shown.map((t) => {
            const linked = t.registrationId ? byRegistration.get(t.registrationId) : undefined;
            const badge = STATUS_BADGE[t.status];
            const busy = busyId === t.id;
            const orphaned = t.status === "approved" && !t.paymentId;
            const editable = t.status !== "approved";
            const missing = Boolean(t.registrationId) && !linked;
            return (
              <div key={t.id} className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
                <div className="grid grid-cols-1 nav:grid-cols-[150px_1fr_300px] gap-3 nav:gap-5 items-start">
                  <div>
                    <b className="font-extrabold text-[1.05rem] tabular-nums block">{formatMnt(t.amount)}</b>
                    <span className="text-ink-3 font-semibold text-[.8rem] tabular-nums">{ubDateTime(t.occurredAt)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[.9rem] text-ink-2 break-words">{t.description || "—"}</p>
                    {t.counterAccount && (
                      <span className="text-ink-3 font-semibold text-[.78rem]">Данс: {t.counterAccount}</span>
                    )}
                    {t.reason && <p className="text-[.82rem] font-semibold text-ink-3 mt-1.5">{t.reason}</p>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center text-[.75rem] font-extrabold px-2.5 py-1 rounded-full ${
                          orphaned ? "text-gold-strong bg-gold-soft" : badge.cls
                        }`}
                      >
                        {orphaned ? "Төлбөр алга" : badge.label}
                      </span>
                      {t.matchSource && t.status !== "skipped" && (
                        <span className="inline-flex items-center text-[.75rem] font-extrabold px-2.5 py-1 rounded-full text-ink-3 bg-bg-soft">
                          {SOURCE_LABEL[t.matchSource] ?? t.matchSource}
                        </span>
                      )}
                    </div>
                    {linked ? (
                      <div className="text-[.85rem]">
                        <b className="font-extrabold block">{linked.name}</b>
                        <span className="text-ink-3 font-semibold">
                          {linked.programLabel}
                          {linked.status === "pending"
                            ? ` · хүлээгдэж буй (${formatMnt(linked.balance)})`
                            : ` · үлдэгдэл ${formatMnt(linked.balance)}`}
                        </span>
                        {t.status === "ready" && overAllotted.has(linked.registrationId) && (
                          <span className="block text-gold-strong font-bold mt-1">
                            Бэлэн гүйлгээнүүд нийт {formatMnt(overAllotted.get(linked.registrationId)!)} — үлдэгдлээс их
                          </span>
                        )}
                      </div>
                    ) : missing ? (
                      <span className="text-[.85rem] font-semibold text-gold-strong">
                        Шинэ эсвэл цуцлагдсан бүртгэл — хуудсаа шинэчилнэ үү
                      </span>
                    ) : (
                      t.status === "review" && <span className="text-[.85rem] font-semibold text-ink-3">Хүүхэд сонгоогүй</span>
                    )}
                    {orphaned && (
                      <div className="text-[.8rem] font-semibold text-ink-3">
                        Батлагдсан ч төлбөр нь бүртгэлд алга (устгагдсан эсвэл тасалдсан).{" "}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            // An approve in flight claims the row a moment before recording.
                            if (t.approvedAt && Date.now() - Date.parse(t.approvedAt) < 2 * 60 * 1000) {
                              setRowError(t.id, "Бүртгэж байж магадгүй — 2 минутын дараа дахин оролдоно уу.");
                              return;
                            }
                            void act(t.id, { action: "reopen" });
                          }}
                          className="font-extrabold text-blue-strong disabled:opacity-50"
                        >
                          Дахин нээх
                        </button>
                      </div>
                    )}
                    {rowErrors[t.id] && <p className="text-red-soft font-bold text-[.82rem]">{rowErrors[t.id]}</p>}
                    {editable && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {t.status === "review" && linked && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act(t.id, { action: "accept" })}
                            className="font-extrabold text-[.8rem] text-white bg-blue rounded-full px-3.5 py-1.5 disabled:opacity-50"
                          >
                            Зөв
                          </button>
                        )}
                        {t.status !== "skipped" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setPickerFor(pickerFor === t.id ? null : t.id);
                              setPickerQuery("");
                            }}
                            className="font-extrabold text-[.8rem] text-blue-strong bg-blue-soft rounded-full px-3.5 py-1.5 disabled:opacity-50"
                          >
                            {t.registrationId ? "Өөр хүүхэд" : "Хүүхэд сонгох"}
                          </button>
                        )}
                        {t.status === "skipped" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act(t.id, { action: "reopen" })}
                            className="font-extrabold text-[.8rem] text-ink-2 bg-bg-soft rounded-full px-3.5 py-1.5 disabled:opacity-50"
                          >
                            Сэргээх
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act(t.id, { action: "skip" })}
                            className="font-extrabold text-[.8rem] text-ink-2 bg-bg-soft rounded-full px-3.5 py-1.5 disabled:opacity-50"
                          >
                            Алгасах
                          </button>
                        )}
                      </div>
                    )}
                    {t.status === "approved" && t.approvedAt && (
                      <span className="text-[.78rem] font-semibold text-ink-3">
                        {ubDay(t.approvedAt)}-нд батлагдсан{t.approvedBy ? ` · ${t.approvedBy}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                {t.status === "review" && t.candidates.length > 0 && pickerFor !== t.id && (
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[.78rem] font-extrabold text-ink-3">Магадгүй:</span>
                    {t.candidates
                      .filter((c) => c.registrationId !== t.registrationId)
                      .slice(0, 3)
                      .map((c) => {
                        const r = byRegistration.get(c.registrationId);
                        if (!r) return null;
                        return (
                          <button
                            key={c.registrationId}
                            type="button"
                            disabled={busy}
                            onClick={() => act(t.id, { action: "link", registrationId: c.registrationId })}
                            title={c.reason}
                            className="font-bold text-[.78rem] text-ink-2 bg-bg-soft border border-line rounded-full px-3 py-1 hover:border-blue disabled:opacity-50"
                          >
                            {r.name} · {r.programLabel}
                          </button>
                        );
                      })}
                  </div>
                )}

                {pickerFor === t.id && (
                  <div className="mt-3 bg-bg-soft rounded-md px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        className={INPUT_CLASS}
                        placeholder="Нэр, утас, хөтөлбөрөөр хайх"
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setPickerFor(null)}
                        aria-label="Хаах"
                        className="shrink-0 w-9 h-9 rounded-full bg-surface grid place-items-center"
                      >
                        <IconClose className="w-4 h-4 text-ink-3" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-col">
                      {pickerMatches.length === 0 ? (
                        <span className="text-[.85rem] font-semibold text-ink-3 py-2">Олдсонгүй.</span>
                      ) : (
                        pickerMatches.map((r) => (
                          <button
                            key={r.registrationId}
                            type="button"
                            disabled={busy}
                            onClick={() => act(t.id, { action: "link", registrationId: r.registrationId })}
                            className="text-left px-3 py-2 rounded-sm hover:bg-surface disabled:opacity-50"
                          >
                            <b className="font-extrabold text-[.88rem]">{r.name}</b>
                            <span className="text-ink-3 font-semibold text-[.82rem]">
                              {" "}
                              · {r.phone} · {r.programLabel} ·{" "}
                              {r.status === "pending" ? "хүлээгдэж буй" : `үлдэгдэл ${formatMnt(r.balance)}`}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Uploaded statements */}
      {statements.length > 0 && (
        <div className="bg-surface border border-line rounded-md shadow-xs overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="text-ink-3 text-[.76rem] font-extrabold tracking-[.05em] uppercase">
                <th className="px-4 py-3">Оруулсан</th>
                <th className="px-4 py-3">Хугацаа</th>
                <th className="px-4 py-3">Орлого</th>
                <th className="px-4 py-3">Анхааруулга</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => {
                const missing =
                  s.footerCreditTotal !== undefined && Math.abs(s.footerCreditTotal - s.rowCreditTotal) > 1;
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="px-4 py-3 font-semibold text-[.85rem] text-ink-2">
                      {ubDateTime(s.createdAt)}
                      {s.uploadedBy && <span className="block text-ink-3 text-[.78rem]">{s.uploadedBy}</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[.85rem] text-ink-2">
                      {s.periodFrom && s.periodTo ? `${s.periodFrom} – ${s.periodTo}` : "—"}
                      <a
                        href={`/api/admin/statements/${s.id}/file`}
                        className="block text-blue-strong font-bold text-[.78rem] break-all"
                      >
                        {s.fileName}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[.85rem] text-ink-2 tabular-nums">
                      {s.creditRows} мөр · {s.newRows} шинэ
                    </td>
                    <td className="px-4 py-3 font-semibold text-[.8rem] text-gold-strong">
                      {missing && <span className="block">Зарим гүйлгээ файлд гараагүй байж магадгүй</span>}
                      {s.balanceGaps > 0 && <span className="block">Үлдэгдэл {s.balanceGaps} газар тасарсан</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={aiRunning !== null}
                        onClick={() => runAi(s.id)}
                        className="font-extrabold text-[.8rem] text-blue-strong bg-blue-soft rounded-full px-3.5 py-1.5 disabled:opacity-50"
                      >
                        {aiRunning === s.id ? "AI хайж байна…" : "AI санал авах"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center px-5 z-50">
          <div className="bg-surface rounded-lg shadow-lg px-7 py-7 max-w-[440px] w-full">
            <h3 className="text-[1.15rem] font-extrabold">Төлбөрүүдийг бүртгэх үү?</h3>
            <p className="text-ink-2 font-medium text-[.9rem] mt-2 leading-[1.6]">
              {ready.length} гүйлгээ, нийт {formatMnt(readyTotal)} холбосон хүүхдүүдийн төлбөрт бүртгэгдэнэ.
              {readyActivations > 0 &&
                ` Хүлээгдэж буй ${readyActivations} бүртгэл идэвхжиж, аккаунттай бол гэр бүлд «Төлбөр баталгаажлаа» SMS очно.`}
              {" "}Батлах мөчид дахин шалгана: аль хэдийн бүртгэгдсэн эсвэл үлдэгдлээс хэтэрсэн гүйлгээ бүртгэгдэхгүй,
              «Шалгах» руу буцна.
            </p>
            {overAllotted.size > 0 && (
              <ul className="mt-3 text-[.85rem] font-semibold text-gold-strong list-disc pl-5">
                {[...overAllotted].map(([id, sum]) => {
                  const r = byRegistration.get(id)!;
                  return (
                    <li key={id}>
                      {r.name}: бэлэн {formatMnt(sum)}, үлдэгдэл {formatMnt(r.balance)}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                disabled={approving}
                onClick={approve}
                className="flex-1 h-11 rounded-full bg-blue text-white font-extrabold disabled:opacity-50"
              >
                {approving ? "Бүртгэж байна…" : "Батлах"}
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => setConfirming(false)}
                className="flex-1 h-11 rounded-full bg-bg-soft text-ink-2 font-extrabold disabled:opacity-50"
              >
                Болих
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
