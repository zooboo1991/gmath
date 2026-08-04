"use client";

import { useEffect, useRef, useState } from "react";
import { useProgramRegister } from "@/components/program/ProgramRegister";
import { IconBell } from "@/components/icons";

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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionUser?.id) return;
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((json) => setItems(json.notifications ?? []))
      .catch(() => setItems([]));
  }, [sessionUser?.id]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={panelRef} className="relative">
      <button
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

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[340px] max-h-[420px] overflow-y-auto bg-surface border border-line rounded-md shadow-md py-2 z-[70]">
          {items.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.85rem] px-4 py-4">Мэдэгдэл алга байна.</p>
          ) : (
            items.map((n) => (
              <div key={n.id} className="px-4 py-3 border-b border-line last:border-0">
                <div className="flex items-start gap-3">
                  {n.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.imageUrl} alt="" className="w-10 h-10 rounded-sm object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <b className="font-extrabold text-[.9rem] block">{n.title}</b>
                    <p className="text-ink-2 font-medium text-[.83rem] mt-0.5">{n.body}</p>
                    <span className="text-ink-3 font-semibold text-[.75rem] mt-1 block">
                      {new Date(n.createdAt).toLocaleDateString("mn-MN")}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
