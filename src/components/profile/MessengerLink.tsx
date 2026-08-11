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
      // Opened rather than navigated: the student comes back to this page after
      // saying hello to the bot, and the token is consumed on that first message.
      window.open(json.url, "_blank", "noopener,noreferrer");
      setState((s) => (s ? { ...s, linked: true } : s));
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
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={link}
          className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full disabled:opacity-50 shrink-0"
        >
          {busy ? "…" : "Холбох"}
        </button>
      )}

      {error && <p className="w-full text-[.82rem] font-semibold text-red-soft">{error}</p>}
    </div>
  );
}
