"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProgramRegister } from "@/components/program/ProgramRegister";
import { IconBell, IconClose } from "@/components/icons";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  createdAt: string;
  readAt?: string;
};

export default function NotificationBell() {
  const { sessionUser } = useProgramRegister();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The bell isn't in the root layout (each page renders its own Navbar), so
  // without this a new notification only ever showed up after a full page
  // navigation happened to remount the component. Polling + a refetch when
  // the tab regains focus covers both "just sitting on one page" and
  // "switched tabs and came back" without needing a websocket for something
  // this low-frequency.
  const POLL_MS = 45_000;

  useEffect(() => {
    if (!sessionUser?.id) return;

    let cancelled = false;
    const load = () => {
      fetch("/api/notifications")
        .then((res) => (res.ok ? res.json() : { notifications: [] }))
        .then((json) => {
          if (!cancelled) setItems(json.notifications ?? []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    };

    load();
    const interval = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionUser?.id]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.readAt);

  // Opening the panel marks everything currently shown as read — matches
  // how most notification bells behave, rather than requiring a per-item click.
  const togglePanel = () => {
    const next = !open;
    setOpen(next);
    if (next && unread.length > 0) {
      const ids = unread.map((n) => n.id);
      fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).catch(() => {});
      const now = new Date().toISOString();
      setItems((its) => its.map((n) => (ids.includes(n.id) ? { ...n, readAt: now } : n)));
    }
  };

  if (!sessionUser) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Мэдэгдэл"
        aria-expanded={open}
        onClick={togglePanel}
        className="relative w-10 h-10 rounded-full hover:bg-blue-soft transition-colors grid place-items-center shrink-0"
      >
        <IconBell className="w-5 h-5 text-ink-2" />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-soft text-white text-[.65rem] font-extrabold grid place-items-center">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {/* Portaled to <body> — this component lives inside the sticky navbar,
          which has backdrop-filter, and backdrop-filter (like filter)
          creates a new containing block for position:fixed descendants. Left
          in place, the panel below was positioning itself relative to the
          76px-tall header instead of the viewport and collapsed to nothing.
          Fixed + viewport-relative: a full-width sheet under the header on
          mobile (the bell isn't flush with the screen edge, so anchoring a
          fixed-width dropdown to it ran off the left edge of narrow phones),
          a right-anchored panel on desktop. */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed left-3 right-3 top-[76px] nav:left-auto nav:right-4 nav:w-[340px] max-h-[70vh] nav:max-h-[420px] overflow-y-auto bg-surface border border-line rounded-md shadow-md py-2 z-[70]"
          >
            {items.length === 0 ? (
              <p className="text-ink-3 font-semibold text-[.85rem] px-4 py-4">Мэдэгдэл алга байна.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setSelected(n);
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 border-b border-line last:border-0 hover:bg-bg-soft transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {n.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.imageUrl} alt="" className="w-10 h-10 rounded-sm object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <b className="font-extrabold text-[.9rem] block">{n.title}</b>
                      <p className="text-ink-2 font-medium text-[.83rem] mt-0.5 line-clamp-2">{n.body}</p>
                      <span className="text-ink-3 font-semibold text-[.75rem] mt-1 block">
                        {new Date(n.createdAt).toLocaleDateString("mn-MN")}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>,
          document.body
        )}

      {selected &&
        createPortal(
          <div
            className="fixed inset-0 bg-[rgba(15,20,40,.6)] backdrop-blur-[3px] flex items-center justify-center z-[200] p-5"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            <div className="bg-surface rounded-lg w-full max-w-[480px] max-h-[88vh] overflow-y-auto shadow-lg">
              {selected.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.imageUrl} alt="" className="w-full max-h-[260px] object-cover rounded-t-lg" />
              )}
              <div className="px-[26px] py-6">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-[1.2rem] font-extrabold">{selected.title}</h3>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Хаах"
                    className="shrink-0 w-8 h-8 rounded-full hover:bg-bg-soft grid place-items-center text-ink-3"
                  >
                    <IconClose className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-ink-3 font-semibold text-[.82rem] block mt-1">
                  {new Date(selected.createdAt).toLocaleString("mn-MN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <p className="text-ink-2 font-medium text-[.95rem] leading-[1.7] mt-4 whitespace-pre-wrap">
                  {selected.body}
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
