"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MathText from "@/components/assessment/MathText";
import { MAX_SOLUTION_IMAGES_PER_PROBLEM } from "@/lib/assessment/config";
import { apiError, readJson } from "@/lib/fetchJson";
import { downscaleImage } from "@/lib/imageResize";
import type { PublicProblem } from "@/lib/assessment/types";

type ChosenProblem = { problem: PublicProblem | null; imageUrls: string[] };

const CARD = "bg-surface border border-line rounded-lg shadow-sm px-[22px] py-[22px]";

export default function SolutionUploader({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<ChosenProblem[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/assessment/${assessmentId}/solutions`);
        const json = await readJson<{ chosen: ChosenProblem[]; status: string }>(res);
        if (cancelled) return;
        if (!res.ok) {
          setError(apiError(res, json, "Ачаалахад алдаа гарлаа"));
          return;
        }
        setChosen(json.chosen ?? []);
        setStatus(json.status ?? "");
      } catch {
        if (!cancelled) setError("Сүлжээний алдаа гарлаа.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const upload = async (problemId: string, files: FileList) => {
    setUploadingId(problemId);
    setError(null);
    try {
      const body = new FormData();
      body.append("problemId", problemId);
      // Shrink on the phone before sending — a raw camera photo is usually
      // several MB and would be rejected by the server limit.
      for (const file of Array.from(files)) {
        body.append("files", await downscaleImage(file));
      }
      const res = await fetch(`/api/assessment/${assessmentId}/solutions`, { method: "POST", body });
      const json = await readJson<{ imageUrls: string[] }>(res);
      if (!res.ok) {
        setError(apiError(res, json, "Байршуулахад алдаа гарлаа"));
        return;
      }
      setChosen((cs) =>
        cs
          ? cs.map((c) =>
              c.problem?.id === problemId ? { ...c, imageUrls: json.imageUrls ?? c.imageUrls } : c
            )
          : cs
      );
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setUploadingId(null);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/submit`, { method: "POST" });
      const json = await readJson(res);
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

  if (error && !chosen) {
    return <p className="text-red-soft font-semibold text-center py-10">{error}</p>;
  }
  if (!chosen) {
    return <p className="text-ink-3 font-semibold text-center py-10">Ачаалж байна…</p>;
  }
  if (status !== "questionnaire_done") {
    return (
      <div className={`${CARD} text-center`}>
        <h2 className="text-[1.2rem] font-extrabold">Бодолт илгээгдсэн байна</h2>
        <p className="text-ink-2 font-medium mt-2">Багшийн дүгнэлтийг профайл дээрээ хүлээнэ үү.</p>
      </div>
    );
  }

  const uploadedCount = chosen.filter((c) => c.imageUrls.length > 0).length;
  const allUploaded = uploadedCount === chosen.length && chosen.length > 0;

  return (
    <div>
      <div className={`${CARD} mb-4`}>
        <h2 className="text-[1.15rem] font-extrabold">Бодолтоо оруулна уу</h2>
        <p className="text-ink-2 font-medium text-[.93rem] mt-2 leading-[1.7]">
          Сонгосон бодлогуудаа цаасан дээр бодоод, гар бичмэлийнхээ зургийг оруулна. Бичиг тод
          харагдахаар, гэрэлтэй газар авна уу. Нэг бодлогод {MAX_SOLUTION_IMAGES_PER_PROBLEM} хүртэл
          зураг оруулж болно.
        </p>
        <p className="text-[.88rem] font-extrabold text-ink-3 mt-3">
          Бэлэн: {uploadedCount} / {chosen.length}
        </p>
      </div>

      {error && (
        <p className="bg-[oklch(0.97_0.03_25)] text-red-soft font-semibold text-[.9rem] rounded-md px-4 py-3 mb-4">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {chosen.map((c, i) => {
          if (!c.problem) return null;
          const pid = c.problem.id;
          const full = c.imageUrls.length >= MAX_SOLUTION_IMAGES_PER_PROBLEM;
          return (
            <div key={pid} className={CARD}>
              <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                <span className="text-[.72rem] font-extrabold text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
                  {i + 1}-р бодлого
                </span>
                {c.imageUrls.length > 0 && (
                  <span className="text-[.72rem] font-extrabold text-green bg-green-soft px-2.5 py-1 rounded-full">
                    {c.imageUrls.length} зураг
                  </span>
                )}
              </div>

              {c.problem.bodyLatex && (
                <MathText source={c.problem.bodyLatex} className="text-[.98rem] overflow-x-auto" />
              )}
              {c.problem.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.problem.imageUrl} alt="" className="mt-2.5 max-w-full rounded-sm border border-line" />
              )}

              {c.imageUrls.length > 0 && (
                <div className="flex gap-2.5 flex-wrap mt-3.5">
                  {c.imageUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="w-[110px] h-[110px] object-cover rounded-sm border border-line"
                    />
                  ))}
                </div>
              )}

              <label
                className={`inline-flex items-center gap-2 text-[.85rem] font-extrabold px-4 py-2.5 rounded-full mt-3.5 ${
                  full
                    ? "text-ink-3 bg-surface-2 cursor-not-allowed"
                    : "text-blue-strong bg-blue-soft cursor-pointer"
                }`}
              >
                {uploadingId === pid
                  ? "Байршуулж байна…"
                  : full
                    ? "Зургийн хязгаарт хүрсэн"
                    : c.imageUrls.length > 0
                      ? "Зураг нэмэх"
                      : "Бодолтын зураг оруулах"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={full || uploadingId !== null}
                  onChange={(e) => {
                    const files = e.target.files;
                    e.target.value = "";
                    if (files && files.length > 0) upload(pid, files);
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!allUploaded || submitting}
        onClick={submit}
        className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50 disabled:pointer-events-none"
      >
        {submitting ? "Илгээж байна…" : allUploaded ? "Багшид илгээх →" : "Бүх бодолтоо оруулна уу"}
      </button>
      <p className="text-center text-ink-3 font-medium text-[.82rem] mt-3">
        Илгээсний дараа зураг солих боломжгүй тул сайн шалгаарай.
      </p>
    </div>
  );
}
