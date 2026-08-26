"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MathText from "@/components/assessment/MathText";
import { MAX_SOLUTION_IMAGES_PER_PROBLEM } from "@/lib/assessment/config";
import { apiError, readJson } from "@/lib/fetchJson";
import { downscaleImage } from "@/lib/imageResize";
import type { PublicProblem } from "@/lib/assessment/types";

type Step = { problem: PublicProblem | null; imageUrls: string[]; skipped: boolean };

const CARD = "bg-surface border border-line rounded-lg shadow-sm px-[22px] py-[22px]";

/** Done means answered one way or the other: photographed, or given up on. */
function isDone(step: Step): boolean {
  return step.skipped || step.imageUrls.length > 0;
}

/**
 * One problem at a time.
 *
 * The whole paper on one page meant a child scrolling ten problems deep,
 * losing which ones they had photographed. A step is a single problem, its
 * photos, and two ways forward — and because every photo and every "бодож
 * чадсангүй" is written to the server as it happens, closing the tab and
 * coming back lands on the step they left.
 */
export default function SolutionUploader({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[] | null>(null);
  // Handed in already? Then this page is a record, not a form.
  const [submitted, setSubmitted] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assessment/${assessmentId}/solutions`)
      .then(async (res) => {
        const json = await readJson<{ steps: Step[]; status?: string }>(res);
        if (cancelled) return;
        if (!res.ok) {
          setError(apiError(res, json, "Ачаалахад алдаа гарлаа"));
          return;
        }
        const loaded = json.steps ?? [];
        // The server refuses every change once the paper is in (409); showing
        // live buttons here only produced errors the child could not act on.
        setSubmitted(json.status !== undefined && json.status !== "questionnaire_done");
        setSteps(loaded);
        // Resume where they left off: the first problem with neither a photo
        // nor a "couldn't solve" against it.
        const next = loaded.findIndex((s) => !isDone(s));
        setIndex(next === -1 ? Math.max(0, loaded.length - 1) : next);
      })
      .catch(() => {
        if (!cancelled) setError("Сүлжээний алдаа гарлаа.");
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  if (error && !steps) {
    return <div className={`${CARD} text-red-soft font-semibold`}>{error}</div>;
  }
  if (!steps) {
    return <div className={`${CARD} text-center text-ink-3 font-semibold`}>Ачаалж байна…</div>;
  }
  if (steps.length === 0) {
    return <div className={`${CARD} text-center text-ink-3 font-semibold`}>Бодлого алга байна.</div>;
  }

  if (submitted) {
    return (
      <div className={`${CARD} text-center`}>
        <h2 className="text-[1.15rem] font-extrabold">Бодолт илгээгдсэн</h2>
        <p className="text-ink-2 font-medium mt-2 leading-[1.7]">
          Багш таны ажлыг шалгаж байна. Дүгнэлт гарсны дараа профайл дээр тань харагдана.
        </p>
        <Link
          href="/profile/assessment"
          className="inline-flex items-center justify-center font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-3.5 mt-5 transition-transform hover:-translate-y-0.5"
        >
          Явцыг харах →
        </Link>
      </div>
    );
  }

  const step = steps[index];
  const total = steps.length;
  const doneCount = steps.filter(isDone).length;
  const allDone = doneCount === total;
  const isLast = index === total - 1;

  const patchStep = (patch: Partial<Step>) =>
    setSteps((current) => current?.map((s, i) => (i === index ? { ...s, ...patch } : s)) ?? current);

  const upload = async (files: File[]) => {
    if (!step.problem) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("problemId", step.problem.id);
      // Shrink on the phone first: a camera photo is several MB and the
      // request body is capped well below that.
      for (const file of files) body.append("files", await downscaleImage(file));

      const res = await fetch(`/api/assessment/${assessmentId}/solutions`, { method: "POST", body });
      const json = await readJson<{ imageUrls: string[] }>(res);
      if (!res.ok) {
        setError(apiError(res, json, "Байршуулахад алдаа гарлаа"));
        return;
      }
      patchStep({ imageUrls: json.imageUrls ?? step.imageUrls, skipped: false });
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!step.problem) return;
    if (!confirm("Энэ бодлогыг бодож чадсангүй гэж тэмдэглэх үү? Зураггүйгээр цааш үргэлжилнэ.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: step.problem.id, skipped: true }),
      });
      const json = await readJson<Record<string, unknown>>(res);
      if (!res.ok) {
        setError(apiError(res, json, "Алдаа гарлаа"));
        return;
      }
      patchStep({ skipped: true });
      if (!isLast) setIndex(index + 1);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!confirm("Бодолтоо багшид илгээх үү? Илгээсний дараа өөрчлөх боломжгүй.")) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/submit`, { method: "POST" });
      const json = await readJson<Record<string, unknown>>(res);
      if (!res.ok) {
        setError(apiError(res, json, "Илгээхэд алдаа гарлаа"));
        return;
      }
      router.push("/profile/assessment");
      router.refresh();
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Where they are in the paper, and which steps are behind them. */}
      <div className={CARD}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <b className="font-extrabold text-[1.05rem]">
            {index + 1} / {total}-р бодлого
          </b>
          <span className="text-[.85rem] font-bold text-ink-3">{doneCount} дууссан</span>
        </div>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}-р бодлого`}
              className={`w-8 h-8 rounded-full text-[.78rem] font-extrabold transition-colors ${
                i === index
                  ? "bg-blue text-white"
                  : s.skipped
                    ? "bg-bg-soft text-ink-3 line-through"
                    : s.imageUrls.length > 0
                      ? "bg-green-soft text-green"
                      : "bg-surface-2 text-ink-3"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className={CARD}>
        {step.problem?.topic && (
          <span className="text-[.72rem] font-extrabold tracking-[.06em] uppercase text-blue-strong">
            {step.problem.topic}
          </span>
        )}
        {step.problem?.bodyLatex && (
          <div className="mt-2.5">
            <MathText source={step.problem.bodyLatex} className="text-[1.02rem] overflow-x-auto" />
          </div>
        )}
        {step.problem?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={step.problem.imageUrl}
            alt=""
            className="mt-3 max-w-full rounded-sm border border-line"
          />
        )}

        <div className="mt-5 pt-5 border-t border-line">
          {step.skipped ? (
            <p className="text-ink-3 font-semibold text-[.9rem]">
              Бодож чадсангүй гэж тэмдэглэсэн. Бодох бол зургаа оруулаарай — тэмдэглэгээ автоматаар
              арилна.
            </p>
          ) : (
            <span className="text-[.85rem] font-extrabold text-ink-2 block mb-2.5">
              Бодолтынхоо зургийг оруулна уу
            </span>
          )}

          {step.imageUrls.length > 0 && (
            <div className="flex gap-2.5 flex-wrap mb-3">
              {step.imageUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="w-[110px] h-[110px] object-cover rounded-sm border border-line"
                  />
                </a>
              ))}
            </div>
          )}

          <label
            className={`inline-flex items-center gap-2 text-[.88rem] font-extrabold px-4 py-2.5 rounded-full ${
              step.imageUrls.length >= MAX_SOLUTION_IMAGES_PER_PROBLEM
                ? "text-ink-3 bg-surface-2 cursor-not-allowed"
                : "text-blue-strong bg-blue-soft cursor-pointer"
            }`}
          >
            {busy
              ? "Байршуулж байна…"
              : step.imageUrls.length >= MAX_SOLUTION_IMAGES_PER_PROBLEM
                ? "Зургийн хязгаарт хүрсэн"
                : step.imageUrls.length > 0
                  ? "Зураг нэмэх"
                  : "Зураг оруулах"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy || step.imageUrls.length >= MAX_SOLUTION_IMAGES_PER_PROBLEM}
              onChange={(e) => {
                // Copy the files out first: clearing the input empties the
                // live FileList, so reading it afterwards finds nothing.
                const picked = [...(e.target.files ?? [])];
                // Cleared so picking the same photo again re-runs.
                e.target.value = "";
                if (picked.length > 0) void upload(picked);
              }}
            />
          </label>

          {error && <p className="text-red-soft font-semibold text-[.85rem] mt-2.5">{error}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          type="button"
          disabled={index === 0 || busy}
          onClick={() => setIndex(index - 1)}
          className="font-extrabold text-[.88rem] text-ink-2 bg-bg-soft px-5 py-3 rounded-full disabled:opacity-40"
        >
          ← Өмнөх
        </button>

        {!step.skipped && step.imageUrls.length === 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={skip}
            className="font-extrabold text-[.88rem] text-ink-2 bg-bg-soft px-5 py-3 rounded-full disabled:opacity-50"
          >
            Бодож чадсангүй
          </button>
        )}

        {!isLast && (
          <button
            type="button"
            disabled={busy || !isDone(step)}
            onClick={() => setIndex(index + 1)}
            className="flex-1 sm:flex-none font-extrabold text-[.9rem] text-white bg-blue shadow-blue px-6 py-3 rounded-full disabled:opacity-40"
          >
            Дараах →
          </button>
        )}
      </div>

      <div className={CARD}>
        {allDone ? (
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50"
          >
            {submitting ? "Илгээж байна…" : "Багшид илгээх →"}
          </button>
        ) : (
          <p className="text-center text-ink-3 font-semibold text-[.88rem]">
            {total - doneCount} бодлого үлдлээ. Бүгдийг бодож дуусмагц илгээх товч гарна.
          </p>
        )}
        <p className="text-center text-ink-3 font-medium text-[.82rem] mt-3">
          Бүх зүйл бөглөх бүрд хадгалагдана — хаагаад дараа үргэлжлүүлж болно.
        </p>
      </div>
    </div>
  );
}
