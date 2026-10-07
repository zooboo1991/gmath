"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { apiError, readJson } from "@/lib/fetchJson";
import { matchName } from "@/lib/miniOlympiad/names";
import type { AdminOlympiadDetail, AdminResultRow } from "@/lib/miniOlympiad/view";
import type { ImportPreviewRow } from "@/lib/miniOlympiad/import";

type Detail = AdminOlympiadDetail;
type Draft = {
  userId: string;
  scores: string[];
  comments: string[];
  notes: string[];
  isNew: boolean;
  /** What the editor opened (null for a child being added); the save is refused if the row changed since. */
  opened: { scores: (number | null)[]; comments: string[]; notes: string[] } | null;
};
type ScanRow = {
  file: File;
  userId: string;
  /** Only the first name fits: shown for the admin to confirm, never picked on their behalf. */
  suggestion: string | null;
  /** The name points at a child who has no result in this olympiad yet. */
  notHere: string | null;
  status: "waiting" | "uploading" | "done" | "error";
  error?: string;
};
type PreviewRow = ImportPreviewRow & { choice: string };
type Told = { notified?: number; notifyFailed?: boolean };

const dot = (d: string) => d.replace(/-/g, ".");
const NOTIFY_FAILED = "Гэр бүлд мэдэгдэл илгээж чадсангүй — «Нуух», дараа нь «Нийтлэх» дарж дахин оролдоно уу.";
const MAX_SCAN_BYTES = 20 * 1024 * 1024;

function extOf(file: File): "pdf" | "jpg" | "png" | null {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (t === "image/jpeg" || n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
  if (t === "image/png" || n.endsWith(".png")) return "png";
  return null;
}

export default function OlympiadDetailPanel({
  initial,
  programLabel,
  canEdit,
}: {
  initial: Detail;
  programLabel: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const { olympiad, results, roster } = detail;
  const count = olympiad.problemCount;
  const maxTotal = count * olympiad.maxPerProblem;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; hasComments: boolean; hasNotes: boolean } | null>(null);
  const [editing, setEditing] = useState<{ title: string; heldOn: string } | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const nameOf = useMemo(() => new Map(roster.map((r) => [r.userId, r.left ? `${r.name} (гарсан)` : r.name])), [roster]);
  const inOlympiad = useMemo(() => new Set(results.map((r) => r.userId)), [results]);
  // Real children only, as the families' "N хүүхдээс" counts them.
  const real = results.filter((r) => !r.isTest);
  const testCount = results.length - real.length;
  const average = real.length ? Math.round((real.reduce((s, r) => s + r.total, 0) / real.length) * 10) / 10 : 0;
  // A choice left in «Сурагч нэмэх…» from before an import may since have a result.
  const addable = addUserId && !inOlympiad.has(addUserId) ? addUserId : "";

  async function call<T extends Record<string, unknown>>(url: string, init: RequestInit, fallback: string) {
    setError(null);
    try {
      const res = await fetch(url, init);
      const json = await readJson<T & Partial<Detail>>(res);
      if (!res.ok) {
        setError(apiError(res, json, fallback));
        return null;
      }
      if (json.olympiad && json.results && json.roster) setDetail(json as unknown as Detail);
      return json;
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
      return null;
    }
  }

  // Families told once each; only those not yet told get the bell on (re)publishing.
  const untold = results.filter((r) => !r.notifiedAt).length;

  function reportTold(json: Told | null, saved: string) {
    if (!json) return;
    if (json.notifyFailed) setError(NOTIFY_FAILED);
    setNotice(`${saved}${json.notified ? ` ${json.notified} гэр бүлд мэдэгдэл очлоо.` : ""}`);
  }

  async function publish(next: boolean) {
    const question = untold > 0
      ? `Дүнг нийтлэх үү? ${untold} хүүхдийн гэр бүлд сайтын мэдэгдэл очно.`
      : "Дүнг дахин нийтлэх үү? Гэр бүлүүд өмнө нь мэдэгдэл авсан тул дахин очихгүй.";
    if (next && !confirm(question)) return;
    setBusy(true);
    const json = await call<{ olympiad: Detail["olympiad"] } & Told>(
      `/api/admin/olympiads/${olympiad.id}/publish`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publish: next }) },
      "Нийтлэхэд алдаа гарлаа"
    );
    if (json?.olympiad) {
      // The bell marks live on the results, so read them back.
      const fresh = await call(`/api/admin/olympiads/${olympiad.id}`, { method: "GET" }, "Дахин ачаалахад алдаа гарлаа");
      if (!fresh) setDetail((d) => ({ ...d, olympiad: json.olympiad! }));
      if (next) reportTold(json, "Нийтлэгдлээ.");
      else setNotice("Дүнг нууллаа.");
    }
    setBusy(false);
  }

  async function saveDetails() {
    if (!editing) return;
    setBusy(true);
    const json = await call<{ olympiad: Detail["olympiad"] }>(
      `/api/admin/olympiads/${olympiad.id}`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) },
      "Хадгалахад алдаа гарлаа"
    );
    setBusy(false);
    if (json?.olympiad) {
      setDetail((d) => ({ ...d, olympiad: json.olympiad! }));
      setEditing(null);
      router.refresh();
    }
  }

  async function remove() {
    if (!confirm(`«${olympiad.title}»-г бүх дүн, бодолтын файлтай нь устгах уу? Буцаах боломжгүй.`)) return;
    setBusy(true);
    const json = await call(`/api/admin/olympiads/${olympiad.id}`, { method: "DELETE" }, "Устгахад алдаа гарлаа");
    setBusy(false);
    if (json) router.push("/admin/olympiads");
  }

  async function readWorkbook(file: File) {
    setNotice(null);
    const body = new FormData();
    body.append("file", file);
    setBusy(true);
    const json = await call<{ rows: ImportPreviewRow[]; hasComments: boolean; hasNotes: boolean }>(
      `/api/admin/olympiads/${olympiad.id}/import`,
      { method: "POST", body },
      "Excel уншихад алдаа гарлаа"
    );
    setBusy(false);
    if (importRef.current) importRef.current.value = "";
    if (json?.rows) {
      setPreview({
        rows: json.rows.map((r) => ({ ...r, choice: r.userId ?? "" })),
        hasComments: Boolean(json.hasComments),
        hasNotes: Boolean(json.hasNotes),
      });
    }
  }

  const previewRows = preview?.rows ?? [];
  const chosen = previewRows.filter((r) => r.choice);
  const duplicate = new Set(chosen.map((r) => r.choice)).size !== chosen.length;
  const suggested = previewRows.filter((r) => !r.choice && r.suggestion);
  const setChoice = (i: number, choice: string) =>
    setPreview((p) => p && { ...p, rows: p.rows.map((x, j) => (j === i ? { ...x, choice } : x)) });

  async function saveImport() {
    if (!preview) return;
    setBusy(true);
    const json = await call<Told>(
      `/api/admin/olympiads/${olympiad.id}/results`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // A workbook without a comments / notes sheet leaves the stored texts alone.
          rows: chosen.map((r) => ({
            userId: r.choice,
            scores: r.scores,
            ...(preview.hasComments ? { comments: r.comments } : {}),
            ...(preview.hasNotes ? { notes: r.notes } : {}),
          })),
        }),
      },
      "Хадгалахад алдаа гарлаа"
    );
    setBusy(false);
    if (json) {
      reportTold(json, `${chosen.length} хүүхдийн дүн хадгалагдлаа.`);
      setPreview(null);
      // An open editor still holds the scores from before the import.
      setDraft(null);
    }
  }

  function openEditor(row: AdminResultRow | null, userId?: string) {
    setDraft(
      row
        ? {
            userId: row.userId,
            scores: row.scores.map((s) => (s === null ? "" : String(s))),
            comments: [...row.comments],
            notes: [...row.notes],
            isNew: false,
            opened: { scores: row.scores, comments: row.comments, notes: row.notes },
          }
        : {
            userId: userId!,
            scores: Array(count).fill(""),
            comments: Array(count).fill(""),
            notes: Array(count).fill(""),
            isNew: true,
            opened: null,
          }
    );
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    const json = await call<Told>(
      `/api/admin/olympiads/${olympiad.id}/results/${draft.userId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scores: draft.scores.map((s) => (s.trim() === "" ? null : Number(s))),
          comments: draft.comments,
          notes: draft.notes,
          opened: draft.opened,
        }),
      },
      "Хадгалахад алдаа гарлаа"
    );
    setBusy(false);
    if (json) {
      reportTold(json, "Хадгалагдлаа.");
      setDraft(null);
    }
  }

  async function removeResult(userId: string) {
    if (!confirm(`${nameOf.get(userId) ?? "Энэ сурагч"}-ийн дүн, бодолтын файлыг хасах уу?`)) return;
    setBusy(true);
    const json = await call(`/api/admin/olympiads/${olympiad.id}/results/${userId}`, { method: "DELETE" }, "Хасахад алдаа гарлаа");
    setBusy(false);
    if (json) setDraft(null);
  }

  async function removeFile(userId: string, path: string) {
    if (!confirm("Энэ файлыг устгах уу?")) return;
    setBusy(true);
    await call(
      `/api/admin/olympiads/${olympiad.id}/results/${userId}/files?path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
      "Устгахад алдаа гарлаа"
    );
    setBusy(false);
  }

  function pickScans(files: FileList | null) {
    if (!files) return;
    setScans(
      [...files].map((file) => {
        // Against the whole programme: a scan of a child without a result must not land on a namesake who has one.
        const m = matchName(file.name.replace(/\.[^.]+$/, ""), roster);
        const here = (id: string | null) => (id && inOlympiad.has(id) ? id : null);
        const pointed = m.userId ?? m.suggestion;
        return {
          file,
          userId: here(m.userId) ?? "",
          suggestion: here(m.suggestion),
          notHere: pointed && !inOlympiad.has(pointed) ? pointed : null,
          status: "waiting" as const,
        };
      })
    );
    if (scanRef.current) scanRef.current.value = "";
  }

  async function uploadScans() {
    setBusy(true);
    setError(null);
    for (let i = 0; i < scans.length; i++) {
      const row = scans[i];
      if (!row.userId || row.status === "done") continue;
      const mark = (patch: Partial<ScanRow>) => setScans((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
      const ext = extOf(row.file);
      if (!ext || row.file.size > MAX_SCAN_BYTES) {
        mark({ status: "error", error: "Зөвхөн PDF/JPG/PNG, 20MB хүртэл" });
        continue;
      }
      mark({ status: "uploading" });
      try {
        const base = `/api/admin/olympiads/${olympiad.id}/results/${row.userId}/files`;
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ext, size: row.file.size }),
        });
        const json = await readJson<{ path: string; signedUrl: string; contentType: string }>(res);
        if (!res.ok || !json.signedUrl || !json.path) throw new Error(apiError(res, json, "Хуулах URL авч чадсангүй"));
        const put = await fetch(json.signedUrl, { method: "PUT", headers: { "Content-Type": json.contentType ?? "" }, body: row.file });
        if (!put.ok) throw new Error("Файл хуулахад алдаа гарлаа");
        const saved = await call(
          base,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: json.path, name: row.file.name, size: row.file.size }),
          },
          "Файл бүртгэхэд алдаа гарлаа"
        );
        if (!saved) throw new Error("Файл бүртгэхэд алдаа гарлаа");
        mark({ status: "done" });
      } catch (err) {
        mark({ status: "error", error: err instanceof Error ? err.message : "Алдаа гарлаа" });
      }
    }
    setBusy(false);
  }

  const draftRow = draft ? results.find((r) => r.userId === draft.userId) : undefined;

  return (
    <div className="flex flex-col gap-4 mt-3">
      {/* Header */}
      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
        {editing ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className={`${INPUT_CLASS} max-w-[320px]`}
              value={editing.title}
              maxLength={120}
              aria-label="Нэр"
              onChange={(e) => setEditing((d) => d && { ...d, title: e.target.value })}
            />
            <input
              type="date"
              className={`${INPUT_CLASS} max-w-[170px]`}
              value={editing.heldOn}
              aria-label="Огноо"
              onChange={(e) => setEditing((d) => d && { ...d, heldOn: e.target.value })}
            />
            <button
              type="button"
              disabled={busy || !editing.title.trim() || !editing.heldOn}
              onClick={saveDetails}
              className="font-extrabold text-[.85rem] text-white bg-blue rounded-full px-4 py-2 disabled:opacity-50"
            >
              Хадгалах
            </button>
            <button type="button" onClick={() => setEditing(null)} className="font-extrabold text-[.85rem] text-ink-2 bg-bg-soft rounded-full px-4 py-2">
              Болих
            </button>
          </div>
        ) : (
          <div>
            <h1 className="text-[1.35rem] font-extrabold">
              {olympiad.title}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing({ title: olympiad.title, heldOn: olympiad.heldOn })}
                  className="ml-2 align-middle font-bold text-[.8rem] text-blue-strong"
                >
                  Засах
                </button>
              )}
            </h1>
            <span className="text-ink-3 font-semibold text-[.88rem]">
              {programLabel} · {dot(olympiad.heldOn)} · {count} бодлого × {olympiad.maxPerProblem} оноо
            </span>
            <p className="text-[.88rem] font-semibold text-ink-2 mt-1.5">
              {real.length} хүүхэд{testCount > 0 ? ` (+${testCount} тест)` : ""} · дундаж {average} / {maxTotal}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center text-[.78rem] font-extrabold px-3 py-1.5 rounded-full ${
              olympiad.publishedAt ? "text-green bg-green-soft" : "text-gold-strong bg-gold-soft"
            }`}
          >
            {olympiad.publishedAt ? "Нийтлэгдсэн — гэр бүлүүд харж байна" : "Ноорог — гэр бүлд харагдахгүй"}
          </span>
          {canEdit && (
            <>
              <button
                type="button"
                disabled={busy || (!olympiad.publishedAt && results.length === 0)}
                title={!olympiad.publishedAt && results.length === 0 ? "Эхлээд дүнгээ оруулна уу" : undefined}
                onClick={() => publish(!olympiad.publishedAt)}
                className={`font-extrabold text-[.85rem] rounded-full px-4 py-2 disabled:opacity-50 ${
                  olympiad.publishedAt ? "text-ink-2 bg-bg-soft" : "text-white bg-blue"
                }`}
              >
                {olympiad.publishedAt ? "Нуух" : "Нийтлэх"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="font-extrabold text-[.85rem] text-red-soft bg-[oklch(0.95_0.03_25)] rounded-full px-4 py-2 disabled:opacity-50"
              >
                Устгах
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-red-soft font-bold text-[.9rem] bg-surface border border-line rounded-md px-4 py-3">{error}</p>}
      {notice && <p className="text-green font-bold text-[.9rem] bg-surface border border-line rounded-md px-4 py-3">{notice}</p>}

      {canEdit && (
        <div className="grid grid-cols-1 nav:grid-cols-2 gap-4">
          {/* Import */}
          <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
            <b className="font-extrabold text-[1rem] block">Excel-ээс дүн оруулах</b>
            <p className="text-ink-3 font-semibold text-[.82rem] mt-1 leading-[1.55]">
              «Сурагч» болон 1…{count} баганатай хуудас. «Тайлбар» (Сурагч, Бодлого, Тайлбар) болон «Багшид» (Сурагч,
              Бодлого, Тэмдэглэл) хуудас байвал тэдгээрийг ч уншина. Хадгалахаас өмнө хүүхэд бүрийг шалгана.
            </p>
            <label className={`inline-flex mt-3 font-extrabold text-[.85rem] text-blue-strong bg-blue-soft rounded-full px-4 py-2 cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
              Excel сонгох
              <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && readWorkbook(e.target.files[0])} />
            </label>
          </div>
          {/* Scans */}
          <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
            <b className="font-extrabold text-[1rem] block">Бодолтын файл хавсаргах</b>
            <p className="text-ink-3 font-semibold text-[.82rem] mt-1 leading-[1.55]">
              PDF эсвэл зураг, олныг зэрэг сонгож болно. Файлын нэрээр хүүхдийг таниж, тааруулсныг тань шалгуулна.
              Зөвхөн тухайн хүүхдийн гэр бүлд харагдана.
            </p>
            <label className={`inline-flex mt-3 font-extrabold text-[.85rem] text-blue-strong bg-blue-soft rounded-full px-4 py-2 cursor-pointer ${busy || results.length === 0 ? "opacity-50 pointer-events-none" : ""}`}>
              Файл сонгох
              <input ref={scanRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => pickScans(e.target.files)} />
            </label>
            {results.length === 0 && <p className="text-[.8rem] font-semibold text-ink-3 mt-2">Эхлээд дүнгээ оруулна уу.</p>}
          </div>
        </div>
      )}

      {/* Import preview */}
      {preview && (
        <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
          <b className="font-extrabold text-[1rem] block">Excel-ийн {previewRows.length} мөр — хүүхэд бүрийг шалгана уу</b>
          <p className="text-ink-3 font-semibold text-[.82rem] mt-1 leading-[1.55]">
            {preview.hasComments
              ? "Тайлбарын хуудас байна — сонгосон хүүхдүүдийн тайлбарыг энэ файлынхаар солино."
              : "Тайлбарын хуудас алга — хадгалсан тайлбар хэвээр үлдэнэ."}{" "}
            {preview.hasNotes
              ? "Тэмдэглэлийн хуудас байна — багшийн тэмдэглэлийг мөн солино."
              : "Тэмдэглэлийн хуудас алга — хадгалсан тэмдэглэл хэвээр үлдэнэ."}
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="text-ink-3 text-[.74rem] font-extrabold uppercase tracking-[.05em]">
                  <th className="px-3 py-2">Файл дахь нэр</th>
                  <th className="px-3 py-2">Сурагч</th>
                  <th className="px-3 py-2">Оноо</th>
                  <th className="px-3 py-2">Нийт</th>
                  <th className="px-3 py-2">Тайлбар</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => {
                  const hint = r.candidates.length > 0 ? r.candidates : r.suggestion ? [r.suggestion] : [];
                  return (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="px-3 py-2 font-semibold text-[.85rem]">{r.name}</td>
                      <td className="px-3 py-2">
                        <select
                          className={`${INPUT_CLASS} ${r.choice ? "" : "border-gold-strong"}`}
                          value={r.choice}
                          onChange={(e) => setChoice(i, e.target.value)}
                        >
                          <option value="">— Алгасах —</option>
                          {[...hint, ...roster.map((p) => p.userId).filter((id) => !hint.includes(id))].map((id) => (
                            <option key={id} value={id}>
                              {nameOf.get(id)}
                              {id === r.userId ? " ✓" : hint.includes(id) ? " ≈" : ""}
                            </option>
                          ))}
                        </select>
                        {!r.choice && r.suggestion && (
                          <span className="block text-[.78rem] font-bold text-gold-strong mt-1">
                            Зөвхөн нэрээр таарсан: {nameOf.get(r.suggestion)} — шалгаад сонгоно уу
                          </span>
                        )}
                        {r.choice && inOlympiad.has(r.choice) && (
                          <span className="block text-[.78rem] font-semibold text-ink-3 mt-1">Дүн нь бий — шинэчлэгдэнэ</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-semibold text-[.82rem] tabular-nums">{r.scores.map((s) => (s === null ? "–" : s)).join(" ")}</td>
                      <td className="px-3 py-2 font-extrabold tabular-nums">{r.scores.reduce<number>((t, s) => t + (s ?? 0), 0)}</td>
                      <td
                        className="px-3 py-2 font-semibold text-[.82rem] text-ink-3 tabular-nums"
                        title={r.comments.map((c, j) => (c ? `${j + 1}: ${c}` : "")).filter(Boolean).join("\n") || undefined}
                      >
                        {r.comments.filter(Boolean).length || "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {previewRows.some((r) => !r.choice) && (
            <p className="text-gold-strong font-bold text-[.85rem] mt-2">
              {previewRows.filter((r) => !r.choice).length} мөрийн хүүхэд тодорхойгүй — сонгоогүй мөр хадгалагдахгүй.
            </p>
          )}
          {duplicate && <p className="text-red-soft font-bold text-[.85rem] mt-2">Нэг хүүхэд хоёр мөрөнд сонгогдсон байна.</p>}
          <div className="flex gap-2 mt-3 flex-wrap">
            {suggested.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const list = suggested.map((r) => `${r.name} → ${nameOf.get(r.suggestion!)}`).join("\n");
                  if (!confirm(`Эдгээр нь зөвхөн нэрээр таарсан. Бүгд зөв үү?\n\n${list}`)) return;
                  setPreview((p) => p && { ...p, rows: p.rows.map((x) => (!x.choice && x.suggestion ? { ...x, choice: x.suggestion } : x)) });
                }}
                className="font-extrabold text-[.85rem] text-gold-strong bg-gold-soft rounded-full px-5 py-2 disabled:opacity-50"
              >
                Нэрээр таарсан {suggested.length}-г шалгасан, сонгох
              </button>
            )}
            <button
              type="button"
              disabled={busy || chosen.length === 0 || duplicate}
              onClick={saveImport}
              className="font-extrabold text-[.85rem] text-white bg-blue rounded-full px-5 py-2 disabled:opacity-50"
            >
              {chosen.length} хүүхдийн дүнг хадгалах
            </button>
            <button type="button" onClick={() => setPreview(null)} className="font-extrabold text-[.85rem] text-ink-2 bg-bg-soft rounded-full px-5 py-2">
              Болих
            </button>
          </div>
        </div>
      )}

      {/* Scan upload queue */}
      {scans.length > 0 && (
        <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4">
          <b className="font-extrabold text-[1rem] block">{scans.length} файл</b>
          <div className="flex flex-col gap-2 mt-3">
            {scans.map((s, i) => (
              <div key={i} className="grid grid-cols-1 nav:grid-cols-[1fr_1fr_140px] gap-2 items-center">
                <span className="font-semibold text-[.85rem] break-all">{s.file.name}</span>
                <div>
                  {/* Locked while uploading: the queue reads each row's child as it was when «Хуулах» was pressed. */}
                  <select
                    className={`${INPUT_CLASS} ${s.userId || s.status === "done" ? "" : "border-gold-strong"}`}
                    value={s.userId}
                    disabled={busy || s.status === "done"}
                    onChange={(e) => setScans((all) => all.map((x, j) => (j === i ? { ...x, userId: e.target.value } : x)))}
                  >
                    <option value="">— Алгасах —</option>
                    {results.map((r) => (
                      <option key={r.userId} value={r.userId}>
                        {r.name}
                        {r.userId === s.suggestion ? " ≈" : ""}
                      </option>
                    ))}
                  </select>
                  {!s.userId && s.suggestion && (
                    <span className="block text-[.78rem] font-bold text-gold-strong mt-1">
                      Зөвхөн нэрээр таарсан: {nameOf.get(s.suggestion)} — шалгаад сонгоно уу
                    </span>
                  )}
                  {!s.userId && s.notHere && (
                    <span className="block text-[.78rem] font-bold text-gold-strong mt-1">
                      {nameOf.get(s.notHere)}-ийн дүн энэ олимпиадад алга — эхлээд дүнг нь оруулна уу
                    </span>
                  )}
                </div>
                <span
                  className={`text-[.8rem] font-bold ${
                    s.status === "done" ? "text-green" : s.status === "error" ? "text-red-soft" : "text-ink-3"
                  }`}
                >
                  {s.status === "done" ? "Хуулагдсан" : s.status === "uploading" ? "Хуулж байна…" : s.status === "error" ? s.error : s.userId ? "Бэлэн" : "Алгасна"}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {scans.some((s) => !s.userId && s.suggestion && s.status !== "done") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const pending = scans.filter((x) => !x.userId && x.suggestion && x.status !== "done");
                  const list = pending.map((x) => `${x.file.name} → ${nameOf.get(x.suggestion!)}`).join("\n");
                  if (!confirm(`Эдгээр нь зөвхөн нэрээр таарсан. Бүгд зөв үү?\n\n${list}`)) return;
                  setScans((all) => all.map((x) => (!x.userId && x.suggestion && x.status !== "done" ? { ...x, userId: x.suggestion } : x)));
                }}
                className="font-extrabold text-[.85rem] text-gold-strong bg-gold-soft rounded-full px-5 py-2 disabled:opacity-50"
              >
                Нэрээр таарсан {scans.filter((s) => !s.userId && s.suggestion && s.status !== "done").length}-г шалгасан, сонгох
              </button>
            )}
            <button
              type="button"
              disabled={busy || !scans.some((s) => s.userId && s.status !== "done")}
              onClick={uploadScans}
              className="font-extrabold text-[.85rem] text-white bg-blue rounded-full px-5 py-2 disabled:opacity-50"
            >
              Хуулах
            </button>
            <button type="button" disabled={busy} onClick={() => setScans([])} className="font-extrabold text-[.85rem] text-ink-2 bg-bg-soft rounded-full px-5 py-2 disabled:opacity-50">
              Хаах
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="bg-surface border border-line rounded-md shadow-xs overflow-x-auto">
        <table className="w-full text-left border-collapse" style={{ minWidth: 360 + count * 44 }}>
          <thead>
            <tr className="text-ink-3 text-[.74rem] font-extrabold uppercase tracking-[.05em]">
              <th className="px-3 py-3">Байр</th>
              <th className="px-3 py-3">Сурагч</th>
              {Array.from({ length: count }, (_, i) => (
                <th key={i} className="px-2 py-3 text-center">
                  {i + 1}
                </th>
              ))}
              <th className="px-3 py-3 text-center">Нийт</th>
              <th className="px-3 py-3 text-center">Файл</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={count + 4} className="px-3 py-8 text-center text-ink-3 font-semibold">
                  Дүн оруулаагүй байна.
                </td>
              </tr>
            ) : (
              results.map((r) => (
                <tr
                  key={r.userId}
                  onClick={() => openEditor(r)}
                  className={`border-t border-line cursor-pointer hover:bg-bg-soft ${draft?.userId === r.userId ? "bg-blue-soft" : ""}`}
                >
                  <td className="px-3 py-2.5 font-extrabold tabular-nums">{r.place}</td>
                  <td className="px-3 py-2.5 font-semibold text-[.88rem]">
                    {r.name}
                    {r.isTest && (
                      <span className="ml-2 text-[.72rem] font-extrabold text-ink-3 bg-bg-soft rounded-full px-2 py-0.5" title="Бусдын байр, хүүхдийн тоонд орохгүй">
                        тест
                      </span>
                    )}
                  </td>
                  {r.scores.map((s, i) => (
                    <td key={i} className={`px-2 py-2.5 text-center tabular-nums text-[.85rem] ${s === olympiad.maxPerProblem ? "font-extrabold text-green" : ""}`}>
                      {s === null ? "–" : s}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center font-extrabold tabular-nums">{r.total}</td>
                  <td className="px-3 py-2.5 text-center text-[.85rem] font-semibold text-ink-3">{r.files.length || ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <select className={`${INPUT_CLASS} max-w-[320px]`} value={addable} onChange={(e) => setAddUserId(e.target.value)}>
            <option value="">Сурагч нэмэх…</option>
            {roster
              .filter((p) => !inOlympiad.has(p.userId))
              .map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!addable}
            onClick={() => {
              openEditor(null, addable);
              setAddUserId("");
            }}
            className="font-extrabold text-[.85rem] text-blue-strong bg-blue-soft rounded-full px-4 py-2 disabled:opacity-50"
          >
            Нэмэх
          </button>
        </div>
      )}

      {/* Editor / viewer for one child */}
      {draft && (
        <div className="bg-surface border border-blue rounded-md shadow-xs px-5 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <b className="font-extrabold text-[1.05rem]">
              {nameOf.get(draft.userId) ?? draftRow?.name}
              {draftRow && ` — ${draftRow.place}-р байр, ${draftRow.total} / ${maxTotal}`}
            </b>
            <button type="button" onClick={() => setDraft(null)} className="font-extrabold text-[.85rem] text-ink-2 bg-bg-soft rounded-full px-4 py-1.5">
              Хаах
            </button>
          </div>
          <div className="flex flex-col gap-3 mt-3">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="grid grid-cols-1 nav:grid-cols-[70px_90px_1fr_1fr] gap-2 items-start border-t border-line pt-3">
                <b className="font-extrabold text-[.9rem] pt-2">{i + 1}-р</b>
                <input
                  type="number"
                  min={0}
                  max={olympiad.maxPerProblem}
                  disabled={!canEdit}
                  placeholder="–"
                  className={INPUT_CLASS}
                  value={draft.scores[i]}
                  onChange={(e) => setDraft((d) => d && { ...d, scores: d.scores.map((v, j) => (j === i ? e.target.value : v)) })}
                />
                <textarea
                  rows={2}
                  disabled={!canEdit}
                  placeholder="Гэр бүлд харагдах тайлбар"
                  className={INPUT_CLASS}
                  value={draft.comments[i]}
                  onChange={(e) => setDraft((d) => d && { ...d, comments: d.comments.map((v, j) => (j === i ? e.target.value : v)) })}
                />
                <textarea
                  rows={2}
                  disabled={!canEdit}
                  placeholder="Зөвхөн багшид харагдах тэмдэглэл"
                  className={`${INPUT_CLASS} bg-gold-soft/40`}
                  value={draft.notes[i]}
                  onChange={(e) => setDraft((d) => d && { ...d, notes: d.notes.map((v, j) => (j === i ? e.target.value : v)) })}
                />
              </div>
            ))}
          </div>
          {draftRow && draftRow.files.length > 0 && (
            <div className="mt-4 flex flex-col gap-1.5">
              <b className="font-extrabold text-[.85rem]">Бодолтын файл</b>
              {draftRow.files.map((f, i) => (
                <div key={f.path} className="flex items-center gap-3 text-[.85rem]">
                  <a
                    href={`/api/admin/olympiads/${olympiad.id}/results/${draftRow.userId}/files/${i}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-blue-strong break-all"
                  >
                    {f.name}
                  </a>
                  {canEdit && (
                    <button type="button" disabled={busy} onClick={() => removeFile(draftRow.userId, f.path)} className="font-bold text-red-soft disabled:opacity-50">
                      Устгах
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex gap-2 mt-4 flex-wrap">
              <button type="button" disabled={busy} onClick={saveDraft} className="font-extrabold text-[.85rem] text-white bg-blue rounded-full px-5 py-2 disabled:opacity-50">
                Хадгалах
              </button>
              {!draft.isNew && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeResult(draft.userId)}
                  className="font-extrabold text-[.85rem] text-red-soft bg-[oklch(0.95_0.03_25)] rounded-full px-5 py-2 disabled:opacity-50"
                >
                  Олимпиадаас хасах
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
