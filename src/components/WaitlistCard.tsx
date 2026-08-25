"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconClock } from "@/components/icons";
import { apiError, readJson } from "@/lib/fetchJson";

type WaitlistRequest = { id: string; grade: string; note: string; status: string };

/**
 * "Хүлээлгийн жагсаалт" — the queue for a class that does not exist yet.
 *
 * Signed-in only: the list exists so these families can be told when their
 * class opens, and a wish from someone nobody can reach is not worth
 * collecting. The grade comes from the profile; the form asks only what the
 * profile cannot answer — which times would suit them.
 */
export default function WaitlistCard({
  signedIn,
  grade,
}: {
  signedIn: boolean;
  /** The child's grade as the profile has it, if any. */
  grade: string;
}) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<WaitlistRequest[] | null>(null);
  const [gradeInput, setGradeInput] = useState(grade);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch("/api/waitlist")
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((json) => {
        if (!cancelled) setMine(json.requests ?? []);
      })
      .catch(() => {
        if (!cancelled) setMine([]);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: gradeInput, note }),
      });
      const json = await readJson<{ request?: WaitlistRequest }>(res);
      const saved = json.request;
      if (!res.ok || !saved) {
        setError(apiError(res, json, "Бүртгэхэд алдаа гарлаа"));
        return;
      }
      setMine((current) => [saved, ...(current ?? []).filter((r) => r.id !== saved.id)]);
      setOpen(false);
      setNote("");
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Хүлээлгийн жагсаалтаас гарах уу?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/waitlist?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) setMine((current) => (current ?? []).filter((r) => r.id !== id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface border border-line rounded-lg shadow-sm px-6 py-6 max-w-[900px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[.72rem] font-extrabold tracking-[.06em] uppercase text-blue-strong">
            <IconClock className="w-3.5 h-3.5" /> Хүлээлгийн жагсаалт
          </span>
          <h3 className="text-[1.15rem] font-extrabold mt-1.5">Хайсан ангиа олсонгүй юу?</h3>
          <p className="text-ink-2 font-medium text-[.92rem] mt-1.5 max-w-[62ch] leading-[1.7]">
            Хүсэлтээ үлдээгээрэй. Аль ангид хэр олон хүүхэд хүлээж байгаа, ямар цагт хичээллэхийг
            хүсэж байгааг нь харгалзан шинэ анги нээнэ. Анги нээгдмэгц бид тантай холбогдоно.
          </p>
        </div>

        {signedIn && (mine?.length ?? 0) === 0 && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 inline-flex items-center justify-center font-extrabold text-[.9rem] rounded-full bg-blue text-white shadow-blue px-6 py-3 transition-transform hover:-translate-y-0.5"
          >
            Бүртгүүлэх →
          </button>
        )}
      </div>

      {!signedIn && (
        <div className="bg-bg-soft rounded-sm px-4 py-3.5 mt-4 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-ink-2 font-bold text-[.9rem]">
            Хүсэлт үлдээхийн тулд бүртгэлээрээ нэвтэрнэ үү.
          </span>
          <Link
            href="/profile"
            className="shrink-0 font-extrabold text-[.88rem] rounded-full bg-blue text-white shadow-blue px-5 py-2.5"
          >
            Нэвтрэх →
          </Link>
        </div>
      )}

      {signedIn && mine && mine.length > 0 && (
        <div className="flex flex-col gap-2.5 mt-4">
          {mine.map((request) => (
            <div
              key={request.id}
              className="bg-green-soft rounded-sm px-4 py-3.5 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0">
                <b className="font-extrabold text-[.92rem] text-green block">
                  {request.grade} — хүсэлт бүртгэгдсэн
                </b>
                {request.note && (
                  <span className="text-ink-2 font-medium text-[.85rem] block mt-0.5">
                    {request.note}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(request.id)}
                className="shrink-0 text-ink-3 font-bold text-[.82rem] underline disabled:opacity-50"
              >
                Жагсаалтаас гарах
              </button>
            </div>
          ))}
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="self-start font-extrabold text-[.85rem] text-blue-strong"
            >
              Өөр анги нэмэх +
            </button>
          )}
        </div>
      )}

      {signedIn && open && (
        <div className="border-t border-line mt-4 pt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Анги</span>
            <input
              type="text"
              value={gradeInput}
              onChange={(e) => setGradeInput(e.target.value)}
              placeholder="Жишээ: 6-р анги"
              className="w-full bg-bg-soft border border-line rounded-sm px-4 py-3 font-semibold text-[.95rem]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">
              Та манай сургалтыг ямар анги хичээллүүлэхийг хүсэж байна вэ?
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Жишээ: 6-р ангийн бүлэг, ажлын өдрийн орой 19:00-оос хойш"
              className="w-full bg-bg-soft border border-line rounded-sm px-4 py-3 font-semibold text-[.95rem] resize-y"
            />
          </label>
          {error && <p className="text-red-soft font-semibold text-[.85rem]">{error}</p>}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="font-extrabold text-[.9rem] rounded-full bg-blue text-white shadow-blue px-6 py-3 disabled:opacity-50"
            >
              {busy ? "Илгээж байна…" : "Хүсэлт илгээх"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-extrabold text-[.88rem] text-ink-3"
            >
              Болих
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
