"use client";

import { useEffect, useRef, useState } from "react";
import { IconChat, IconClose } from "@/components/icons";

type Message = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "gmath_chat_conversation_id";

const GREETING =
  "Сайн байна уу! Сургалт, үнэ, хуваарийн талаар асуухыг хүссэн зүйлээ бичээрэй.";

/**
 * Site-wide AI chat launcher, mounted once in the root layout next to
 * Analytics/ServiceWorkerRegister. Unlike those two it does render UI, but
 * follows the same "no props, mounted once, manages its own state" shape.
 *
 * The conversation id lives in sessionStorage so a page navigation continues
 * the same thread instead of starting over, while closing the tab starts
 * fresh — matching how a visitor thinks about a support chat.
 */
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId: sessionStorage.getItem(STORAGE_KEY) ?? undefined,
        }),
      });
      const json = await res.json();
      // The route returns its conversationId even on a provider failure, so
      // the retry lands in the same thread rather than orphaning the message
      // it already persisted.
      if (json.conversationId) sessionStorage.setItem(STORAGE_KEY, json.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.ok ? json.reply : json.error ?? "Алдаа гарлаа." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Холбогдож чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу." },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Чат хаах" : "Чат нээх"}
        aria-expanded={open}
        // Gold, not navy: the launcher sits over the navy hero on most pages,
        // where a navy circle disappears entirely. Gold reads clearly against
        // both the hero and the white/soft page sections further down.
        className="fixed bottom-5 right-5 w-14 h-14 rounded-full bg-gold text-gold-ink grid place-items-center shadow-gold hover:bg-gold-strong transition-colors z-[90]"
      >
        {open ? <IconClose className="w-6 h-6" /> : <IconChat className="w-6 h-6" />}
      </button>

      {open && (
        <div className="fixed bottom-[88px] left-3 right-3 sm:left-auto sm:right-5 sm:w-[360px] h-[min(70vh,480px)] bg-surface border border-line rounded-lg shadow-lg flex flex-col overflow-hidden z-[90]">
          <div className="bg-navy text-white px-4 py-3.5 shrink-0">
            <b className="font-extrabold text-[.95rem] block">Онлайн туслах</b>
            <span className="text-[.78rem] font-semibold opacity-80">Сургалтын талаар асууна уу</span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3.5 flex flex-col gap-2.5">
            <p className="self-start max-w-[85%] bg-bg-soft text-ink-2 font-medium text-[.85rem] leading-[1.55] px-3.5 py-2.5 rounded-md">
              {GREETING}
            </p>
            {messages.map((m, i) => (
              <p
                key={i}
                className={
                  m.role === "user"
                    ? "self-end max-w-[85%] bg-navy text-white font-semibold text-[.85rem] leading-[1.55] px-3.5 py-2.5 rounded-md whitespace-pre-wrap"
                    : "self-start max-w-[85%] bg-bg-soft text-ink-2 font-medium text-[.85rem] leading-[1.55] px-3.5 py-2.5 rounded-md whitespace-pre-wrap"
                }
              >
                {m.content}
              </p>
            ))}
            {busy && (
              <span className="self-start text-ink-3 font-semibold text-[.8rem] px-1">Бичиж байна…</span>
            )}
          </div>

          <form onSubmit={send} className="flex border-t border-line shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              type="text"
              placeholder="Асуултаа бичнэ үү…"
              maxLength={2000}
              className="flex-1 min-w-0 px-3.5 py-3 text-[.88rem] font-medium bg-transparent outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="px-4 text-[.85rem] font-extrabold text-white bg-navy disabled:opacity-40 transition-opacity shrink-0"
            >
              Илгээх
            </button>
          </form>
        </div>
      )}
    </>
  );
}
