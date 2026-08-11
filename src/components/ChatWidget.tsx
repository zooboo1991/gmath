"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconChat, IconClose } from "@/components/icons";

type Message = { role: "user" | "assistant"; content: string };

/**
 * Only internal paths the site actually has — the model must never be able to
 * turn its own output into a link pointing somewhere arbitrary. Anything else
 * it emits (external URLs, /admin, a made-up path) stays plain text.
 */
const SAFE_PATH = /^\/(?:courses|assessment|certificate|articles|profile|team)(?:\/[A-Za-z0-9-]+)*$/;

/**
 * The only external hosts worth making clickable: the Facebook group and Zoom
 * room a paid student's own registration carries. Kept to an allowlist rather
 * than "any https URL" so a hallucinated — or injected — link can't become a
 * live one; anything else stays inert text.
 */
const SAFE_EXTERNAL = /^https:\/\/(?:[A-Za-z0-9-]+\.)*(?:facebook\.com|fb\.me|zoom\.us)\/[^\s)]*$/i;

/**
 * The model writes markdown-flavoured replies: `[Нэр](/courses/id)` links and
 * `**bold**`. Rendering that small subset keeps replies readable — without it
 * a bare UUID path wrapped over two lines and `**` showed up literally.
 * Deliberately hand-rolled rather than pulling in a markdown library: only
 * these two forms are supported, and no raw HTML is ever rendered.
 */
const RICH_RE = /(\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*\n]+\*\*|https?:\/\/[^\s)]+|\/[A-Za-z0-9][A-Za-z0-9\-/]*)/g;

const LINK_CLASS = "underline font-extrabold text-navy break-words";

/** External links open in a new tab so the visitor doesn't lose the chat. */
function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {children}
    </a>
  );
}

function renderRich(text: string) {
  // String.split with a capturing group puts the captured matches at the odd
  // indices — used instead of re-testing RICH_RE, whose /g lastIndex is
  // stateful and would misfire on a second call.
  return text.split(RICH_RE).map((part, i) => {
    if (i % 2 === 0) return part;

    const mdLink = part.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
    if (mdLink) {
      const [, label, href] = mdLink;
      // Next's Link, not a bare <a>: client-side nav keeps this widget (it
      // lives in the root layout) mounted, so the panel stays open behind the
      // page the visitor just jumped to.
      if (SAFE_PATH.test(href)) {
        return (
          <Link key={i} href={href} className={LINK_CLASS}>
            {label}
          </Link>
        );
      }
      if (SAFE_EXTERNAL.test(href)) {
        return (
          <ExternalLink key={i} href={href}>
            {label}
          </ExternalLink>
        );
      }
      return label;
    }

    if (part.startsWith("**")) {
      return (
        <b key={i} className="font-extrabold">
          {part.slice(2, -2)}
        </b>
      );
    }

    // A bare URL or path the model wrote without markdown around it.
    if (SAFE_EXTERNAL.test(part)) {
      return (
        <ExternalLink key={i} href={part}>
          {part}
        </ExternalLink>
      );
    }
    return SAFE_PATH.test(part) ? (
      <Link key={i} href={part} className={LINK_CLASS}>
        {part}
      </Link>
    ) : (
      part
    );
  });
}

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
                {m.role === "assistant" ? renderRich(m.content) : m.content}
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
