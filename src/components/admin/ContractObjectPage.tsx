"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconArrowLeft, IconDocument } from "@/components/icons";
import { Card } from "./AdminObjectPageParts";
import { StatusBadge } from "./panels/ContractsPanel";
import type { ContractTag, ContractTemplate } from "@/lib/contracts/db";
import { CONTRACT_FIELDS, FIELD_GROUP_LABELS, type ContractFieldGroup } from "@/lib/contracts/fields";
import { formatMb } from "@/lib/imageResize";

type Program = { id: string; label: string; tag: string; yearly: boolean };
type Student = { registrationId: string; name: string; phone: string; missing: string[] };
type Roster = { programId: string; label: string; students: Student[] };

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const GROUP_ORDER: ContractFieldGroup[] = ["student", "parent", "registration", "program", "system"];

/**
 * Нэг гэрээний загварын хуудас: Word файл, тагийн зураглал, холбогдох
 * сургалтууд, эцэст нь нэг сурагчийн гэрээг татах.
 */
export default function ContractObjectPage({
  template: initial,
  programs,
  rosters,
}: {
  template: ContractTemplate;
  programs: Program[];
  rosters: Roster[];
}) {
  const router = useRouter();
  const [template, setTemplate] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [tags, setTags] = useState<ContractTag[]>(initial.tags);
  const [programIds, setProgramIds] = useState<string[]>(initial.programIds);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const dirty =
    title !== template.title ||
    JSON.stringify(tags) !== JSON.stringify(template.tags) ||
    JSON.stringify([...programIds].sort()) !== JSON.stringify([...template.programIds].sort());

  const save = async (patch: Record<string, unknown> = {}) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/contracts/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tags, programIds, ...patch }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setMessage({ tone: "error", text: json.error ?? "Хадгалж чадсангүй" });
        return;
      }
      setTemplate(json.template);
      setTags(json.template.tags);
      setProgramIds(json.template.programIds);
      setMessage({ tone: "ok", text: "Хадгаллаа" });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Сүлжээний алдаа" });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setMessage({ tone: "error", text: "Зөвхөн .docx файл байршуулна уу (Word 2007-оос хойших)" });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/contracts/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: file.size }),
      });
      const json = await res.json();
      if (!res.ok || !json.signedUrl) {
        setMessage({ tone: "error", text: json.error ?? "Байршуулахад алдаа гарлаа" });
        return;
      }
      const put = await fetch(json.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": DOCX_MIME },
        body: file,
      });
      if (!put.ok) {
        setMessage({ tone: "error", text: "Файлыг байршуулж чадсангүй. Дахин оролдоно уу." });
        return;
      }
      await save({ filePath: json.path, fileName: file.name, fileSize: file.size });
    } catch {
      setMessage({ tone: "error", text: "Сүлжээний алдаа" });
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!confirm("Энэ гэрээний загварыг устгах уу?")) return;
    const res = await fetch(`/api/admin/contracts/${template.id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/contracts");
  };

  const mapped = tags.filter((t) => t.field).length;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[900px]">
      <Link
        href="/admin/contracts"
        className="inline-flex items-center gap-1.5 text-ink-3 font-bold text-[.85rem] hover:text-ink"
      >
        <IconArrowLeft className="w-4 h-4" /> Гэрээнүүд
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mt-3 mb-6">
        <div className="min-w-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-[1.5rem] font-extrabold bg-transparent border-b border-transparent hover:border-line focus:border-blue outline-none w-full max-w-[520px]"
          />
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={template.status} />
            <button
              type="button"
              onClick={() => save({ status: template.status === "active" ? "draft" : "active" })}
              className="text-[.8rem] font-extrabold text-blue-strong"
            >
              {template.status === "active" ? "Ноорог болгох" : "Идэвхжүүлэх"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={remove}
            className="h-11 px-4 rounded-md border border-line font-extrabold text-[.85rem] text-red-soft"
          >
            Устгах
          </button>
          <button
            type="button"
            onClick={() => save()}
            disabled={saving || !dirty}
            className="h-11 px-5 rounded-md bg-navy text-white font-extrabold text-[.88rem] disabled:opacity-50"
          >
            {saving ? "Хадгалж байна…" : "Хадгалах"}
          </button>
        </div>
      </div>

      {message && (
        <p
          className={`font-bold text-[.88rem] mb-4 ${message.tone === "ok" ? "text-green" : "text-red-soft"}`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-col gap-5">
        <Card title="Word загвар">
          <p className="text-[.85rem] font-semibold text-ink-2 leading-[1.6] mb-3">
            Word дээрээ гэрээгээ бичээд, нөхөгдөх газруудад{" "}
            <code className="bg-bg-soft px-1.5 py-0.5 rounded-xs font-bold">{"{сурагчийн_нэр}"}</code>{" "}
            маягаар таг тавина. Тагийн нэрийг та өөрөө сонгоно — байршуулсны дараа систем нь бүх
            тагийг олж, доор жагсаана.
          </p>

          {template.fileName ? (
            <div className="flex items-center justify-between gap-3 flex-wrap bg-bg-soft rounded-sm px-4 py-3">
              <span className="flex items-center gap-2.5 min-w-0">
                <IconDocument className="w-5 h-5 shrink-0 text-ink-3" />
                <span className="min-w-0">
                  <b className="block font-bold text-[.9rem] truncate">{template.fileName}</b>
                  <span className="text-[.78rem] font-semibold text-ink-3">
                    {template.fileSize ? formatMb(template.fileSize) : ""} · {tags.length} таг
                  </span>
                </span>
              </span>
              <UploadButton label="Солих" busy={uploading} onPick={upload} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap bg-gold-soft border border-gold/30 rounded-sm px-4 py-3">
              <span className="font-bold text-[.9rem] text-gold-ink">Файл хараахан байршуулаагүй</span>
              <UploadButton label="Word файл сонгох" busy={uploading} onPick={upload} />
            </div>
          )}
        </Card>

        <Card
          title="Тагийн зураглал"
          action={
            tags.length > 0 ? (
              <span className="text-[.8rem] font-extrabold text-ink-3">
                {`${mapped}/${tags.length} холбогдсон`}
              </span>
            ) : undefined
          }
        >
          {tags.length === 0 ? (
            <p className="text-[.88rem] font-semibold text-ink-3">
              Файл байршуулсны дараа доторх тагууд энд гарч ирнэ.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {tags.map((tag, i) => (
                <div key={tag.tag} className="flex items-center justify-between gap-3 flex-wrap py-2.5">
                  <code className="font-bold text-[.88rem] bg-bg-soft px-2 py-1 rounded-xs">
                    {`{${tag.tag}}`}
                  </code>
                  <select
                    value={tag.field ?? ""}
                    onChange={(e) => {
                      const next = [...tags];
                      next[i] = { tag: tag.tag, field: e.target.value || undefined };
                      setTags(next);
                    }}
                    className="h-10 min-w-[260px] rounded-md border border-line px-3 font-semibold text-[.88rem] bg-surface"
                  >
                    <option value="">— холбоогүй (хоосон үлдэнэ)</option>
                    {GROUP_ORDER.map((group) => (
                      <optgroup key={group} label={FIELD_GROUP_LABELS[group]}>
                        {CONTRACT_FIELDS.filter((f) => f.group === group).map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Холбогдох сургалтууд">
          <p className="text-[.85rem] font-semibold text-ink-2 leading-[1.6] mb-3">
            Энэ гэрээ аль сургалтад хамаарах вэ. Нэг гэрээг олон сургалтад холбож болно.
          </p>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {programs.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-sm hover:bg-bg-soft cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={programIds.includes(p.id)}
                  onChange={(e) =>
                    setProgramIds((prev) =>
                      e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                    )
                  }
                  className="w-4 h-4"
                />
                <span className="min-w-0">
                  <b className="block font-bold text-[.88rem] truncate">{p.label}</b>
                  <span className="text-[.74rem] font-semibold text-ink-3">
                    {p.yearly ? "1 жилийн хөтөлбөр" : p.tag}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <GenerateCard template={template} rosters={rosters} dirty={dirty} />
      </div>
    </div>
  );
}

function UploadButton({
  label,
  busy,
  onPick,
}: {
  label: string;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  return (
    <label className="shrink-0 inline-flex items-center h-10 px-4 rounded-md bg-surface border border-line font-extrabold text-[.85rem] cursor-pointer hover:border-blue">
      {busy ? "Байршуулж байна…" : label}
      <input
        type="file"
        accept=".docx"
        disabled={busy}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Утга цэвэрлэхээс ӨМНӨ хуулбарлана — цэвэрлэхэд FileList хоосорно.
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </label>
  );
}

/** Нэг сурагч сонгоод бөглөсөн Word файлыг татаж авах хэсэг. */
function GenerateCard({
  template,
  rosters,
  dirty,
}: {
  template: ContractTemplate;
  rosters: Roster[];
  dirty: boolean;
}) {
  const [programId, setProgramId] = useState(rosters[0]?.programId ?? "");
  const [registrationId, setRegistrationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roster = rosters.find((r) => r.programId === programId);
  const student = roster?.students.find((s) => s.registrationId === registrationId);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/contracts/${template.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Гэрээ үүсгэж чадсангүй");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${template.title} - ${student?.name ?? ""}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Сүлжээний алдаа");
    } finally {
      setBusy(false);
    }
  };

  if (!template.filePath) return null;

  return (
    <Card title="Гэрээ үүсгэх">
      {dirty && (
        <p className="text-[.85rem] font-bold text-gold-strong mb-3">
          Хадгалаагүй өөрчлөлт байна — эхлээд «Хадгалах» дарна уу.
        </p>
      )}
      {rosters.length === 0 ? (
        <p className="text-[.88rem] font-semibold text-ink-3">
          Эхлээд дээрээс сургалт холбож, хадгална уу.
        </p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[.78rem] font-extrabold text-ink-3 uppercase tracking-[.04em] mb-1.5">
                Сургалт
              </span>
              <select
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  setRegistrationId("");
                }}
                className="h-11 w-full rounded-md border border-line px-3 font-semibold text-[.9rem] bg-surface"
              >
                {rosters.map((r) => (
                  <option key={r.programId} value={r.programId}>
                    {`${r.label} (${r.students.length})`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[.78rem] font-extrabold text-ink-3 uppercase tracking-[.04em] mb-1.5">
                Сурагч
              </span>
              <select
                value={registrationId}
                onChange={(e) => setRegistrationId(e.target.value)}
                className="h-11 w-full rounded-md border border-line px-3 font-semibold text-[.9rem] bg-surface"
              >
                <option value="">— сонгоно уу</option>
                {(roster?.students ?? []).map((s) => (
                  <option key={s.registrationId} value={s.registrationId}>
                    {`${s.name} · ${s.phone}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Дутуу талбарыг урьдчилж хэлнэ — гэрээ гарсны дараа хоосон мөр
              олж гайхахаас илүү. */}
          {student && student.missing.length > 0 && (
            <p className="text-[.85rem] font-semibold text-gold-strong bg-gold-soft rounded-sm px-3 py-2.5 mt-3 leading-[1.6]">
              {`Энэ сурагчийн ${student.missing.join(", ")} бөглөгдөөгүй байна. Гэрээн дээр хоосон үлдэнэ — хэрэглэгчийн хуудаснаас нөхөж бөглөж болно.`}
            </p>
          )}

          <button
            type="button"
            onClick={download}
            disabled={busy || !registrationId || dirty}
            className="h-11 px-5 mt-4 rounded-md bg-blue text-white font-extrabold text-[.88rem] disabled:opacity-50"
          >
            {busy ? "Үүсгэж байна…" : "Word татаж авах"}
          </button>
          {error && <p className="text-red-soft font-bold text-[.85rem] mt-2">{error}</p>}
        </>
      )}
    </Card>
  );
}
