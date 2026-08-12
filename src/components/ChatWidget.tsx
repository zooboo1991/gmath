"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconClose } from "@/components/icons";

/** "admin" is a human reply that arrived during a takeover — labelled as such in the thread. */
type Message = { role: "user" | "assistant" | "admin"; content: string; createdAt?: string };

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

const OPEN_CHAT_EVENT = "gmath:open-chat";

/**
 * Opens the chat from anywhere on the site (the FAQ's "ask us" panel calls
 * this). A window event rather than context or a store: this widget is
 * mounted once in the root layout as a *sibling* of {children}, so a provider
 * would have to wrap both just to carry one boolean, and the widget keeps its
 * "no props, owns its own state" shape.
 */
export function openChatWidget() {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}

/**
 * `?chat=1` means "arrive with the chat open" — that's the link the Messenger
 * persistent menu points at, so tapping "AI туслахаас асуух" on the Facebook
 * Page lands the visitor in a ready chat instead of on a homepage they have to
 * hunt around.
 *
 * Read through useSyncExternalStore rather than an effect: the server snapshot
 * is false, so the HTML matches and the flag flips right after hydration, with
 * no setState inside an effect (which the react-hooks rules reject, and which
 * would cost an extra render anyway).
 */
const NOOP_SUBSCRIBE = () => () => {};

function readChatParam(): boolean {
  return new URLSearchParams(window.location.search).get("chat") === "1";
}

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
  const pathname = usePathname();
  // null = the visitor hasn't opened or closed it yet, so the URL decides.
  // Once they act, their choice wins for the rest of the visit.
  const [openState, setOpenState] = useState<boolean | null>(null);
  const wantsChatFromUrl = useSyncExternalStore(NOOP_SUBSCRIBE, readChatParam, () => false);
  const open = openState ?? wantsChatFromUrl;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // "admin" once a person has taken the conversation over; the bot stays quiet
  // until they hand it back, and the visitor is told so.
  const [mode, setMode] = useState<"bot" | "admin">("bot");
  // created_at of the newest message we've already shown — the poll's cursor.
  const lastSeenRef = useRef<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  // Lets other parts of the page (the FAQ panel) open the chat.
  useEffect(() => {
    const openFromPage = () => setOpenState(true);
    window.addEventListener(OPEN_CHAT_EVENT, openFromPage);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, openFromPage);
  }, []);

  /**
   * Picks up whatever was added to the thread server-side — an admin's reply,
   * or the takeover itself. Polling (not a socket) because this hits our own
   * database, only while the panel is open, and the alternative is a
   * websocket layer for a handful of conversations a day.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      const conversationId = sessionStorage.getItem(STORAGE_KEY);
      if (!conversationId) return;
      try {
        const params = new URLSearchParams({ conversationId });
        if (lastSeenRef.current) params.set("after", lastSeenRef.current);
        const res = await fetch(`/api/chat/messages?${params}`);
        if (cancelled) return;
        // The stored id no longer resolves for this visitor — the row is gone,
        // or the visitor cookie changed under it. Forget it instead of polling
        // a 404 every four seconds for as long as the panel stays open; the
        // next message simply starts a fresh thread.
        if (res.status === 404) {
          sessionStorage.removeItem(STORAGE_KEY);
          return;
        }
        if (!res.ok) return;
        const json = await res.json();
        if (json.mode) setMode(json.mode);
        const incoming: Message[] = json.messages ?? [];
        if (incoming.length === 0) return;
        lastSeenRef.current = incoming[incoming.length - 1].createdAt;
        // Only what this widget didn't render itself: the visitor's own lines
        // and the bot's reply are already on screen from the POST.
        const fresh = incoming.filter((m) => m.role === "admin");
        if (fresh.length > 0) setMessages((prev) => [...prev, ...fresh]);
      } catch {
        // Retried on the next tick.
      }
    };
    void tick();
    const timer = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open]);

  // The widget is for visitors; on admin pages it just floats over the
  // sidebar's own chat-oversight UI. After every hook, per the rules of hooks.
  if (pathname.startsWith("/admin")) return null;

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
      // Handed over: there is no bot reply to show, so say who is coming
      // instead of leaving the visitor watching a dead thread.
      if (json.handedOver) {
        setMode("admin");
        return;
      }
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
      {/* Closed: the mascot plus an invitation, so it reads as "ask me
          something" rather than an anonymous icon. Open: shrinks back to a
          plain close circle — a full-width pill would sit on top of the panel
          it belongs to. Gold either way, not navy: the launcher floats over the
          navy hero on most pages, where a navy circle disappears.

          The white ring is what keeps it readable as a separate, floating
          control: the site's own CTAs are the same gold, so when the launcher
          scrolls over one they merged into a single shape. */}
      {open ? (
        <button
          type="button"
          onClick={() => setOpenState(false)}
          aria-label="Чат хаах"
          aria-expanded
          className="fixed bottom-5 right-5 w-14 h-14 rounded-full bg-gold text-gold-ink grid place-items-center ring-[3px] ring-white shadow-lg hover:bg-gold-strong transition-colors z-[90]"
        >
          <IconClose className="w-6 h-6" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpenState(true)}
          aria-label="Чат нээх"
          aria-expanded={false}
          className="fixed bottom-5 right-5 flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-gold text-gold-ink ring-[3px] ring-white shadow-lg hover:bg-gold-strong transition-colors z-[90]"
        >
          <span className="w-11 h-11 rounded-full bg-surface grid place-items-center shrink-0 overflow-hidden">
            <Image
              src="/images/mascot-head.png"
              alt=""
              width={965}
              height={835}
              className="w-8 h-8 object-contain"
            />
          </span>
          <b className="font-extrabold text-[.85rem] whitespace-nowrap">Асуух зүйл байна уу?</b>
        </button>
      )}

      {open && (
        <div className="fixed bottom-[88px] left-3 right-3 sm:left-auto sm:right-5 sm:w-[360px] h-[min(70vh,480px)] bg-surface border border-line rounded-lg shadow-lg flex flex-col overflow-hidden z-[90]">
          <div className="bg-navy text-white px-4 py-3.5 shrink-0">
            <b className="font-extrabold text-[.95rem] block">
              {mode === "admin" ? "Багштай чатлаж байна" : "AI туслах"}
            </b>
            <span className="text-[.78rem] font-semibold opacity-80">
              {mode === "admin" ? "Хүн шууд хариулж байна" : "Сургалтын талаар асууна уу"}
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3.5 flex flex-col gap-2.5">
            <p className="self-start max-w-[85%] bg-bg-soft text-ink-2 font-medium text-[.85rem] leading-[1.55] px-3.5 py-2.5 rounded-md">
              {GREETING}
            </p>
            {messages.map((m, i) =>
              m.role === "admin" ? (
                // Visually distinct from the bot on purpose: a parent should be
                // able to tell at a glance that a person answered this line.
                <span key={i} className="self-start max-w-[85%]">
                  <small className="block text-[.7rem] font-extrabold text-gold-strong mb-1">Багш</small>
                  <p className="bg-gold-soft text-ink font-medium text-[.85rem] leading-[1.55] px-3.5 py-2.5 rounded-md whitespace-pre-wrap">
                    {renderRich(m.content)}
                  </p>
                </span>
              ) : (
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
              )
            )}
            {busy && mode === "bot" && (
              <span className="self-start text-ink-3 font-semibold text-[.8rem] px-1">Бичиж байна…</span>
            )}
            {mode === "admin" && (
              // No "typing" animation here — a human may take minutes, and a
              // fake indicator would read as the page being stuck.
              <span className="self-start text-ink-3 font-semibold text-[.8rem] px-1">
                Багш хариултаа бичих хүртэл хүлээнэ үү.
              </span>
            )}
          </div>

          <form onSubmit={send} className="flex border-t border-line shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              type="text"
              placeholder={mode === "admin" ? "Багшид бичнэ үү…" : "Асуултаа бичнэ үү…"}
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
