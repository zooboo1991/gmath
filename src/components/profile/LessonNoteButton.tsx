"use client";

import { useState } from "react";
import { IconDocument } from "@/components/icons";
import { apiError, readJson } from "@/lib/fetchJson";

/**
 * "Тэмдэглэл" — the PDF of what was worked through in the lesson.
 *
 * Opened in a new tab rather than in a modal like the recording: a PDF is read,
 * scrolled, zoomed, printed and saved, and the browser's own viewer does all of
 * that better than an iframe can — on a phone especially. The URL is fetched on
 * click and never rendered into the page, for the same reason the recording's
 * is: it is signed, expiring, and only minted for a student who is actually
 * registered on the course.
 */
export default function LessonNoteButton({
  courseId,
  lessonIndex,
  sizeLabel,
}: {
  courseId: string;
  lessonIndex: number;
  /** e.g. "1.1MB" — so nobody on mobile data is surprised by what they tapped. */
  sizeLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lessons/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, lessonIndex }),
      });
      const json = await readJson<{ url: string }>(res);
      if (!res.ok || !json.url) {
        setError(apiError(res, json, "Тэмдэглэл нээхэд алдаа гарлаа"));
        return;
      }
      window.open(json.url, "_blank", "noreferrer");
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        disabled={busy}
        onClick={open}
        className="inline-flex items-center gap-1.5 font-extrabold text-[.8rem] text-ink-2 bg-bg-soft rounded-full px-3.5 py-2 disabled:opacity-60"
      >
        <IconDocument className="w-3 h-3" /> {busy ? "Нээж байна…" : "Тэмдэглэл"}
        {sizeLabel && !busy && <span className="font-bold text-ink-3">· {sizeLabel}</span>}
      </button>
      {error && <span className="text-[.72rem] font-bold text-red-soft">{error}</span>}
    </span>
  );
}
