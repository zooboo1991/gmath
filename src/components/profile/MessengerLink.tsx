"use client";

import { useEffect, useState } from "react";
import { IconCheckCircle, IconFacebook } from "@/components/icons";

type State = { linked: boolean; configured: boolean } | null;

/**
 * Profile card for linking a Facebook account to this gmath account, so the
 * Messenger bot can answer the same personal questions the website chat does.
 *
 * Linking starts here rather than in Messenger on purpose: the student is
 * already signed in on this page, which proves they control the account that
 * holds the registrations — stronger (and free) compared with asking for a
 * phone number and sending an SMS code.
 */
export default function MessengerLink() {
  const [state, setState] = useState<State>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<{ code: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/messenger/link")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.ok) setState({ linked: json.linked, configured: json.configured });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const link = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messenger/link", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "");
      // Shows the code instead of jumping straight to Messenger: the ref in the
      // m.me link only survives inside the mobile app, so the student needs to
      // see the code they can type either way.
      setCode({ code: json.code, url: json.url });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Холбоход алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messenger/link", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setState((s) => (s ? { ...s, linked: false } : s));
      setCode(null);
    } catch {
      setError("Салгахад алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  // Nothing to offer until the Messenger app is configured server-side.
  if (!state?.configured) return null;

  return (
    <div className="card-flat px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2.5">
        <IconFacebook className="w-4 h-4 text-ink-3 shrink-0" />
        <div>
          <b className="font-extrabold text-[.92rem] block">Messenger-тэй холбох</b>
          <span className="text-ink-3 font-semibold text-[.82rem]">
            {state.linked
              ? "Facebook Messenger-ээс хичээлийн хуваарь, группээ асууж болно."
              : "Холбовол Messenger-ээс ч хувийн мэдээллээ асууж болно."}
          </span>
        </div>
      </div>

      {state.linked ? (
        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[.85rem] font-extrabold text-green">
            <IconCheckCircle className="w-4 h-4" /> Холбогдсон
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={unlink}
            className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2 rounded-full disabled:opacity-50"
          >
            {busy ? "…" : "Салгах"}
          </button>
        </div>
      ) : code ? null : (
        <button
          type="button"
          disabled={busy}
          onClick={link}
          className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full disabled:opacity-50 shrink-0"
        >
          {busy ? "…" : "Холбох"}
        </button>
      )}

      {code && !state.linked && (
        <div className="w-full bg-bg-soft rounded-md px-4 py-3.5 flex flex-col gap-2.5">
          <p className="text-ink-2 font-semibold text-[.85rem] leading-[1.55]">
            Messenger дээр манай хуудсанд доорх кодыг бичиж илгээнэ үү. Код 15 минут хүчинтэй.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="font-extrabold text-[1.35rem] tracking-[.18em] text-navy bg-surface px-4 py-2 rounded-sm border border-line">
              {code.code}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(code.code)}
              className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2 rounded-full"
            >
              Хуулах
            </button>
            <a
              href={code.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[.82rem] font-extrabold text-white bg-blue px-4 py-2 rounded-full"
            >
              Messenger нээх
            </a>
          </div>
          <p className="text-ink-3 font-semibold text-[.78rem]">
            Холбогдсоны дараа бот танд батламж мессеж илгээнэ.
          </p>
        </div>
      )}

      {error && <p className="w-full text-[.82rem] font-semibold text-red-soft">{error}</p>}
    </div>
  );
}
