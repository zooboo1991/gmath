"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import MathText from "@/components/assessment/MathText";
import type { GradingDetail as Detail } from "@/lib/assessment/gradingDetail";
import type { Level } from "@/lib/assessment/types";

const INPUT =
  "w-full px-3.5 py-2.5 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue focus:bg-surface";
const CARD = "bg-surface border border-line rounded-md shadow-xs px-[20px] py-[18px]";

const ACTION_LABEL: Record<string, string> = {
  too_easy: "Амархан",
  dont_know: "Мэдэхгүй",
};

export default function GradingDetail({ detail, levels }: { detail: Detail; levels: Level[] }) {
  const router = useRouter();
  const [items, setItems] = useState(detail.items);
  const [sheetUrl, setSheetUrl] = useState(detail.gradedSheetUrl);
  const [teacherComment, setTeacherComment] = useState(detail.assessment.teacherComment ?? "");
  const [finalLevel, setFinalLevel] = useState(
    String(detail.assessment.finalLevel ?? detail.assessment.estimatedLevel ?? "")
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = detail.assessment.status === "completed";
  const id = detail.assessment.id;

  const saveScore = async (solutionId: string, graderScore: string, graderComment: string) => {
    setSavingId(solutionId);
    setError(null);
    setSavedId(null);
    try {
      const res = await fetch(`/api/admin/grading/${id}/score`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solutionId, graderScore, graderComment }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      setItems((is) =>
        is.map((it) => (it.solution?.id === solutionId ? { ...it, solution: json.solution } : it))
      );
      setSavedId(solutionId);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSavingId(null);
    }
  };

  const uploadSheet = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/grading/${id}/sheet`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Байршуулахад алдаа гарлаа");
        return;
      }
      setSheetUrl(json.url);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setUploading(false);
    }
  };

  const complete = async () => {
    if (!confirm("Үнэлгээг дуусгах уу? Дараа нь оноо засах боломжгүй болно.")) return;
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/grading/${id}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherComment, finalLevel }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Дуусгахад алдаа гарлаа");
        return;
      }
      router.push("/admin/grading");
      router.refresh();
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setCompleting(false);
    }
  };

  const q = detail.questionnaire;

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="sticky top-0 z-10 bg-surface border-b border-line">
        <div className="wrap flex items-center justify-between h-[68px] gap-3">
          <Link
            href="/admin/grading"
            className="inline-flex items-center gap-2 font-extrabold text-ink-2 hover:text-ink text-[.92rem] shrink-0"
          >
            ← Буцах
          </Link>
          {detail.user ? (
            <Link
              href={`/admin/users/${detail.user.id}`}
              className="font-extrabold text-[1rem] truncate hover:text-blue-strong hover:underline"
            >
              {detail.user.lastName} {detail.user.firstName}
            </Link>
          ) : (
            <b className="font-extrabold text-[1rem] truncate">Хэрэглэгч устсан</b>
          )}
          {done ? (
            <span className="text-[.75rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full shrink-0">
              Түвшин {detail.assessment.finalLevel}
            </span>
          ) : (
            <span className="w-[70px]" />
          )}
        </div>
      </header>

      <div className="wrap max-w-[820px] py-7 flex flex-col gap-4">
        {error && (
          <p className="bg-[oklch(0.97_0.03_25)] text-red-soft font-semibold text-[.9rem] rounded-md px-4 py-3">
            {error}
          </p>
        )}

        <div className={CARD}>
          <h2 className="text-[1.02rem] font-extrabold mb-3">Сурагчийн мэдээлэл</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[.9rem]">
            {[
              ["Анги", q?.grade || detail.user?.grade || "—"],
              ["Нас", q?.age ? String(q.age) : "—"],
              ["Сургууль", detail.user?.school ?? "—"],
              ["Утас", detail.user?.phone ?? "—"],
              ["Олимпиадад бэлтгэсэн", q?.hasPrepared ? "Тийм" : "Үгүй"],
              ["Олимпиадад оролцсон", q?.hasCompeted ? "Тийм" : "Үгүй"],
              ["Тооцоолсон түвшин", detail.assessment.estimatedLevel ? String(detail.assessment.estimatedLevel) : "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 py-1 border-b border-line last:border-0">
                <span className="font-bold text-ink-3">{label}</span>
                <span className="font-extrabold text-right">{value}</span>
              </div>
            ))}
          </div>
          {q?.achievements && (
            <p className="text-[.9rem] text-ink-2 font-medium mt-3 pt-3 border-t border-line">
              <span className="font-extrabold text-ink-3">Амжилт: </span>
              {q.achievements}
            </p>
          )}
          {detail.skipped.length > 0 && (
            <p className="text-[.85rem] text-ink-3 font-semibold mt-3 pt-3 border-t border-line">
              Алгассан: {detail.skipped.map((s) => `${ACTION_LABEL[s.action]} (хүндрэл ${s.difficulty ?? "?"})`).join(" · ")}
            </p>
          )}
        </div>

        <h2 className="text-[1.1rem] font-extrabold mt-1">Бодолтууд ({items.length})</h2>

        {items.map((item, i) => (
          <SolutionCard
            key={item.problem?.id ?? i}
            index={i}
            item={item}
            done={done}
            saving={savingId === item.solution?.id}
            saved={savedId === item.solution?.id}
            onSave={saveScore}
          />
        ))}

        <div className={CARD}>
          <h2 className="text-[1.02rem] font-extrabold mb-1">Багшийн эцсийн дүгнэлт</h2>
          <p className="text-ink-3 font-semibold text-[.85rem] mb-4">
            Энэ хэсэг сурагчийн профайл дээр шууд харагдана.
          </p>

          <label className="flex flex-col gap-1.5 mb-3.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Дүгнэлт, зөвлөмж</span>
            <textarea
              value={teacherComment}
              onChange={(e) => setTeacherComment(e.target.value)}
              rows={5}
              disabled={done}
              placeholder="Хүчтэй тал, сул тал, юун дээр анхаарах вэ…"
              className={`${INPUT} resize-y disabled:opacity-60`}
            />
          </label>

          <label className="flex flex-col gap-1.5 mb-3.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Эцсийн түвшин</span>
            <select
              value={finalLevel}
              onChange={(e) => setFinalLevel(e.target.value)}
              disabled={done}
              className={`${INPUT} disabled:opacity-60`}
            >
              <option value="">— Түвшин сонгоно уу —</option>
              {levels.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.id} — {l.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-4">
            <span className="text-[.8rem] font-extrabold text-ink-3 block mb-2">
              Засаж скан хийсэн хуудас (заавал биш)
            </span>
            {sheetUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sheetUrl} alt="" className="max-w-[300px] rounded-sm border border-line mb-2.5" />
            )}
            {!done && (
              <label className="inline-flex items-center gap-2 text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2.5 rounded-full cursor-pointer">
                {uploading ? "Байршуулж байна…" : sheetUrl ? "Скан солих" : "Скан оруулах"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadSheet(f);
                  }}
                />
              </label>
            )}
          </div>

          {done ? (
            <p className="text-green font-extrabold text-[.9rem]">
              Энэ үнэлгээ дууссан. Сурагч үр дүнгээ профайл дээрээ харж байна.
            </p>
          ) : (
            <button
              type="button"
              disabled={completing}
              onClick={complete}
              className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-6 py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50"
            >
              {completing ? "Хадгалж байна…" : "Үнэлгээг дуусгаж сурагчид илгээх"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SolutionCard({
  index,
  item,
  done,
  saving,
  saved,
  onSave,
}: {
  index: number;
  item: Detail["items"][number];
  done: boolean;
  saving: boolean;
  saved: boolean;
  onSave: (solutionId: string, score: string, comment: string) => void;
}) {
  const [score, setScore] = useState(
    item.solution?.graderScore === undefined ? "" : String(item.solution.graderScore)
  );
  const [comment, setComment] = useState(item.solution?.graderComment ?? "");

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <span className="text-[.72rem] font-extrabold text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
          {index + 1}-р бодлого
        </span>
        {item.problem && (
          <span className="text-[.72rem] font-extrabold text-ink-2 bg-surface-2 px-2.5 py-1 rounded-full">
            Хүндрэл {item.problem.difficulty}
          </span>
        )}
        {item.problem?.topic && (
          <span className="text-[.82rem] font-bold text-ink-3">{item.problem.topic}</span>
        )}
        {item.solution?.gradedAt && (
          <span className="text-[.72rem] font-extrabold text-green bg-green-soft px-2.5 py-1 rounded-full">
            Шалгасан
          </span>
        )}
      </div>

      {item.problem?.bodyLatex && (
        <MathText source={item.problem.bodyLatex} className="text-[.95rem] overflow-x-auto" />
      )}
      {item.problem?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.problem.imageUrl} alt="" className="mt-2.5 max-w-[260px] rounded-sm border border-line" />
      )}
      {item.problem?.answerKey && (
        <p className="text-[.85rem] text-ink-3 font-semibold mt-2.5">
          Зөв хариу: <span className="font-mono text-ink-2">{item.problem.answerKey}</span>
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-line">
        <span className="text-[.8rem] font-extrabold text-ink-3 block mb-2">Сурагчийн бодолт</span>
        {item.imageUrls.length === 0 ? (
          <p className="text-ink-3 font-semibold text-[.88rem]">Зураг алга.</p>
        ) : (
          <div className="flex gap-2.5 flex-wrap">
            {item.imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="w-[150px] h-[150px] object-cover rounded-sm border border-line hover:border-blue transition-colors"
                />
              </a>
            ))}
          </div>
        )}
        <p className="text-[.78rem] text-ink-3 font-medium mt-1.5">Томруулж харах бол зураг дээр дарна уу.</p>
      </div>

      {item.solution && (
        <div className="mt-4 pt-4 border-t border-line grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2.5 items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Оноо (0-10)</span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              disabled={done}
              className={`${INPUT} disabled:opacity-60`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Тайлбар</span>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={done}
              placeholder="Алдаа хаана гарсан бэ"
              className={`${INPUT} disabled:opacity-60`}
            />
          </label>
          {!done && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(item.solution!.id, score, comment)}
              className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? "…" : saved ? "Хадгаллаа" : "Хадгалах"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
