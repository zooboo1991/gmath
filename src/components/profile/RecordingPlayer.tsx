"use client";

import { useEffect, useState } from "react";
import { IconClose, IconPlay } from "@/components/icons";
import { apiError, readJson } from "@/lib/fetchJson";

/**
 * "Бичлэг үзэх" that keeps the student on gmath.mn.
 *
 * The playback URL is fetched on click, never rendered into the page: it is
 * signed and short-lived, and minting it server-side is what keeps a recording
 * from being readable by anyone who opens devtools on the profile page. A
 * recording that still lives on Drive/YouTube comes back flagged `external` and
 * opens in a new tab exactly as it used to.
 */
export default function RecordingPlayer({
  courseId,
  lessonIndex,
  topic,
}: {
  courseId: string;
  lessonIndex: number;
  topic: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lessons/recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, lessonIndex }),
      });
      const json = await readJson<{ url: string; external: boolean }>(res);
      if (!res.ok || !json.url) {
        setError(apiError(res, json, "Бичлэг нээхэд алдаа гарлаа"));
        return;
      }
      if (json.external) {
        window.open(json.url, "_blank", "noreferrer");
        return;
      }
      setUrl(json.url);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  // Escape closes, and the page behind stops scrolling while the player is up.
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUrl(null);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [url]);

  return (
    <>
      <span className="flex flex-col items-end gap-1 shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={open}
          className="inline-flex items-center gap-1.5 font-extrabold text-[.8rem] text-blue-strong bg-blue-soft rounded-full px-3.5 py-2 disabled:opacity-60"
        >
          <IconPlay className="w-3 h-3" /> {busy ? "Нээж байна…" : "Бичлэг үзэх"}
        </button>
        {error && <span className="text-[.72rem] font-bold text-red-soft">{error}</span>}
      </span>

      {url && (
        <div
          className="fixed inset-0 z-[100] bg-[rgba(5,15,35,.82)] grid place-items-center px-3 py-6"
          onClick={() => setUrl(null)}
        >
          {/* Stops a click inside the player from closing it. */}
          <div className="w-full max-w-[900px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <b className="text-white font-extrabold text-[.95rem] truncate">{topic}</b>
              <button
                type="button"
                onClick={() => setUrl(null)}
                aria-label="Хаах"
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white grid place-items-center shrink-0 transition-colors"
              >
                <IconClose className="w-4 h-4" />
              </button>
            </div>
            {/* 16:9 box so the iframe has a size before the video loads. */}
            <div className="relative w-full pt-[56.25%] rounded-md overflow-hidden bg-black">
              <iframe
                src={url}
                title={topic}
                loading="lazy"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
