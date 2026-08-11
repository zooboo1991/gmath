"use client";

import { useEffect, useState } from "react";
import type { AdminChatMessage } from "@/lib/db";

/**
 * One conversation's full transcript, fetched when the component mounts —
 * which is exactly when an admin expands the row, so transcripts are never
 * loaded for conversations nobody opens. Shared between the dashboard's
 * "Чат" tab and the user detail page's chat tab.
 */
export default function ChatTranscript({ conversationId }: { conversationId: string }) {
  const [state, setState] = useState<{ status: "loading" | "done" | "error"; messages?: AdminChatMessage[] }>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/chats/${conversationId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => {
        if (!cancelled) setState({ status: "done", messages: json.messages });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (state.status === "loading") {
    return <p className="text-ink-3 font-semibold text-[.85rem] py-3">Ачааллаж байна…</p>;
  }
  if (state.status === "error") {
    return <p className="text-red-soft font-semibold text-[.85rem] py-3">Ачаалахад алдаа гарлаа.</p>;
  }
  if (!state.messages || state.messages.length === 0) {
    return <p className="text-ink-3 font-semibold text-[.85rem] py-3">Мессеж алга.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5 py-3">
      {state.messages.map((m, i) => (
        <div key={i} className={m.role === "user" ? "self-end max-w-[85%]" : "self-start max-w-[85%]"}>
          {/* Same colour language as the visitor-facing widget: user navy, bot soft grey. */}
          <p
            className={
              m.role === "user"
                ? "bg-navy text-white font-semibold text-[.85rem] leading-[1.55] px-3.5 py-2.5 rounded-md whitespace-pre-wrap"
                : "bg-bg-soft text-ink-2 font-medium text-[.85rem] leading-[1.55] px-3.5 py-2.5 rounded-md whitespace-pre-wrap"
            }
          >
            {m.content}
          </p>
          <span className={`text-ink-3 font-semibold text-[.72rem] mt-0.5 block ${m.role === "user" ? "text-right" : ""}`}>
            {new Date(m.createdAt).toLocaleString("mn-MN")}
          </span>
        </div>
      ))}
    </div>
  );
}
