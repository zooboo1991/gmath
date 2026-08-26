"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import MathText from "@/components/assessment/MathText";
import type { GradingDetail as Detail } from "@/lib/assessment/gradingDetail";
import { INPUT_CLASS } from "@/components/admin/panels/shared";

const CARD = "bg-surface border border-line rounded-md shadow-xs px-[20px] py-[18px]";

/** One card's marking, as it stands in the form. */
type Mark = { score: string; comment: string };

const EMPTY_MARK: Mark = { score: "", comment: "" };

function initialMarks(items: Detail["items"]): Record<string, Mark> {
  const marks: Record<string, Mark> = {};
  for (const item of items) {
    if (!item.solution) continue;
    marks[item.solution.id] = {
      score: item.solution.graderScore === undefined ? "" : String(item.solution.graderScore),
      comment: item.solution.graderComment ?? "",
    };
  }
  return marks;
}

const ACTION_LABEL: Record<string, string> = {
  too_easy: "Амархан",
  dont_know: "Мэдэхгүй",
};

export default function GradingDetail({ detail }: { detail: Detail }) {
  const router = useRouter();
  const [items, setItems] = useState(detail.items);
  const [sheets, setSheets] = useState(detail.gradedSheets);
  const [teacherComment, setTeacherComment] = useState(detail.assessment.teacherComment ?? "");
  // Every card's score and note live here rather than inside the card, so
  // "Дуусгах" can write out anything the teacher typed but did not press
  // save on. They used to be lost without a word.
  const [marks, setMarks] = useState<Record<string, Mark>>(() => initialMarks(detail.items));
  const [savedMarks, setSavedMarks] = useState<Record<string, Mark>>(() => initialMarks(detail.items));
  // Turned on by a refused "Дуусгах": until then an unscored card looks
  // ordinary, because nothing is wrong with it while the teacher is still
  // working through the paper.
  const [showMissing, setShowMissing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = detail.assessment.status === "completed";
  const id = detail.assessment.id;

  /** Writes one card out. Returns false so callers can stop on the first failure. */
  const persistMark = async (solutionId: string, mark: Mark): Promise<boolean> => {
    try {
      const res = await fetch(`/api/admin/grading/${id}/score`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solutionId,
          graderScore: mark.score,
          graderComment: mark.comment,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return false;
      }
      setItems((is) =>
        is.map((it) => (it.solution?.id === solutionId ? { ...it, solution: json.solution } : it))
      );
      setSavedMarks((current) => ({ ...current, [solutionId]: mark }));
      return true;
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
      return false;
    }
  };

  const saveScore = async (solutionId: string) => {
    setSavingId(solutionId);
    setError(null);
    setSavedId(null);
    const ok = await persistMark(solutionId, marks[solutionId] ?? EMPTY_MARK);
    setSavingId(null);
    if (ok) setSavedId(solutionId);
  };

  /**
   * Work the child handed in that carries no score yet. Every photographed
   * solution has to be marked — a wrong answer is 0, not a blank — otherwise
   * the family reads "Оноо тавиагүй" on their own paper.
   */
  const missing = items.filter(
    (item) =>
      item.solution &&
      item.imageUrls.length > 0 &&
      !(marks[item.solution.id]?.score ?? "").trim()
  );

  /** Cards holding something the server has not been told about yet. */
  const unsaved = Object.keys(marks).filter((solutionId) => {
    const saved = savedMarks[solutionId] ?? EMPTY_MARK;
    const now = marks[solutionId] ?? EMPTY_MARK;
    return now.score !== saved.score || now.comment !== saved.comment;
  });

  /** Uploaded one at a time so a half-finished batch still keeps what landed. */
  const uploadSheets = async (files: File[]) => {
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch(`/api/admin/grading/${id}/sheet`, { method: "POST", body });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Байршуулахад алдаа гарлаа");
          return;
        }
        setSheets((current) => [...current, { path: json.path, url: json.url }]);
      }
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setUploading(false);
    }
  };

  const removeSheet = async (path: string) => {
    if (!confirm("Энэ зургийг хасах уу?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/grading/${id}/sheet`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Хасахад алдаа гарлаа");
        return;
      }
      setSheets((current) => current.filter((s) => s.path !== path));
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    }
  };

  /** Voids the sitting so the student can start over — the wrong-photo case. */
  const cancelSitting = async () => {
    if (
      !confirm(
        "Энэ шалгалтыг цуцлах уу? Сурагч анхнаасаа дахин өгөх боломжтой болно. Одоо байгаа зураг, оноо хадгалагдах ч сурагчид харагдахгүй."
      )
    ) {
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/grading/${id}/cancel`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Цуцлахад алдаа гарлаа");
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

  const complete = async () => {
    if (missing.length > 0) {
      setShowMissing(true);
      setError(
        `${missing.length} бодлогод оноо тавиагүй байна. Буруу бодсон бол 0 оноо өгнө үү.`
      );
      const first = missing[0].solution?.id;
      if (first) {
        document.getElementById(`solution-${first}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }
    if (!confirm("Үнэлгээг дуусгах уу? Дараа нь оноо засах боломжгүй болно.")) return;
    setCompleting(true);
    setError(null);
    try {
      // Anything typed into a card but not saved goes out first — finishing
      // must never be the step that throws a teacher's marking away.
      for (const solutionId of unsaved) {
        if (!(await persistMark(solutionId, marks[solutionId] ?? EMPTY_MARK))) {
          return;
        }
      }
      const res = await fetch(`/api/admin/grading/${id}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherComment }),
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
              Дууссан
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
              [
                "Бодлогын ангилал",
                detail.assessment.category
                  ? `${detail.assessment.category} (${detail.assessment.category === "C" ? "5-6" : "7-8"} анги)`
                  : "—",
              ],
              ["Нас", q?.age ? String(q.age) : "—"],
              ["Сургууль", detail.user?.school ?? "—"],
              ["Утас", detail.user?.phone ?? "—"],
              ["Олимпиадад бэлтгэсэн", q?.hasPrepared ? "Тийм" : "Үгүй"],
              ["Олимпиадад оролцсон", q?.hasCompeted ? "Тийм" : "Үгүй"],
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
            mark={(item.solution && marks[item.solution.id]) ?? EMPTY_MARK}
            dirty={Boolean(item.solution && unsaved.includes(item.solution.id))}
            missingScore={showMissing && missing.some((m) => m.solution?.id === item.solution?.id)}
            saving={savingId === item.solution?.id}
            saved={savedId === item.solution?.id}
            onChange={(mark) =>
              item.solution &&
              setMarks((current) => ({ ...current, [item.solution!.id]: mark }))
            }
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
              className={`${INPUT_CLASS} resize-y disabled:opacity-60`}
            />
          </label>

          <div className="mb-4">
            <span className="text-[.8rem] font-extrabold text-ink-3 block mb-2">
              Засаж скан хийсэн хуудсууд (заавал биш)
            </span>
            {sheets.length > 0 && (
              <div className="flex gap-2.5 flex-wrap mb-2.5">
                {sheets.map((sheet) => (
                  <div key={sheet.path} className="relative">
                    <a href={sheet.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sheet.url}
                        alt=""
                        className="w-[130px] h-[130px] object-cover rounded-sm border border-line hover:border-blue transition-colors"
                      />
                    </a>
                    {!done && (
                      <button
                        type="button"
                        onClick={() => removeSheet(sheet.path)}
                        aria-label="Зураг хасах"
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-surface border border-line text-ink-3 hover:text-red-soft grid place-items-center shadow-xs"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!done && (
              <label className="inline-flex items-center gap-2 text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2.5 rounded-full cursor-pointer">
                {uploading ? "Байршуулж байна…" : sheets.length > 0 ? "Зураг нэмэх" : "Зураг оруулах"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = "";
                    if (files.length > 0) void uploadSheets(files);
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
            <>
              {showMissing && missing.length > 0 && (
                <p className="text-red-soft bg-[oklch(0.97_0.03_25)] font-extrabold text-[.85rem] rounded-md px-4 py-3 mb-3">
                  {missing.length} бодлого үнэлэгдээгүй байна (улаанаар тэмдэглэв). Бодолт оруулсан
                  бодлого бүрд оноо өгөх шаардлагатай — буруу бол 0.
                </p>
              )}
              {unsaved.length > 0 && (
                <p className="text-gold-strong bg-gold-soft font-extrabold text-[.85rem] rounded-md px-4 py-3 mb-3">
                  {unsaved.length} бодлогын оноо хадгалагдаагүй байна. «Дуусгах» дарахад тэдгээр нь
                  хамт хадгалагдана.
                </p>
              )}
              <button
                type="button"
                disabled={completing}
                onClick={complete}
                className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-6 py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50"
              >
                {completing ? "Хадгалж байна…" : "Үнэлгээг дуусгаж сурагчид илгээх"}
              </button>

              {/* Rare but necessary: a child who photographed the wrong page
                  has nothing markable here, and no way back on their own. */}
              <button
                type="button"
                disabled={completing}
                onClick={cancelSitting}
                className="w-full font-extrabold text-[.88rem] text-red-soft bg-surface border border-line-2 rounded-full px-6 py-3 mt-2.5 disabled:opacity-50"
              >
                Шалгалтыг цуцлаж дахин өгүүлэх
              </button>
            </>
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
  mark,
  dirty,
  missingScore,
  saving,
  saved,
  onChange,
  onSave,
}: {
  index: number;
  item: Detail["items"][number];
  done: boolean;
  mark: Mark;
  /** Typed here but not yet on the server. */
  dirty: boolean;
  /** Handed-in work with no score, after "Дуусгах" was refused over it. */
  missingScore: boolean;
  saving: boolean;
  saved: boolean;
  onChange: (mark: Mark) => void;
  onSave: (solutionId: string) => void;
}) {
  const { score, comment } = mark;

  return (
    <div
      id={item.solution ? `solution-${item.solution.id}` : undefined}
      className={missingScore ? `${CARD} border-red-soft border-2` : CARD}
    >
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
            <span
              className={`text-[.8rem] font-extrabold ${missingScore ? "text-red-soft" : "text-ink-3"}`}
            >
              {missingScore ? "Оноо оруулна уу" : "Оноо (0-10)"}
            </span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={score}
              onChange={(e) => onChange({ ...mark, score: e.target.value })}
              disabled={done}
              className={`${INPUT_CLASS} disabled:opacity-60 ${
                missingScore ? "border-red-soft" : ""
              }`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Тайлбар</span>
            <input
              type="text"
              value={comment}
              onChange={(e) => onChange({ ...mark, comment: e.target.value })}
              disabled={done}
              placeholder="Алдаа хаана гарсан бэ"
              className={`${INPUT_CLASS} disabled:opacity-60`}
            />
          </label>
          {!done && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(item.solution!.id)}
              className={`text-[.85rem] font-extrabold px-4 py-2.5 rounded-full disabled:opacity-50 whitespace-nowrap ${
                dirty ? "text-white bg-gold-strong" : "text-white bg-blue"
              }`}
            >
              {saving ? "…" : saved && !dirty ? "Хадгаллаа" : "Хадгалах"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
