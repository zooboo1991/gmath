"use client";

import { useState } from "react";
import ChatPanel from "@/components/admin/panels/ChatPanel";
import ChatReportsPanel from "@/components/admin/panels/ChatReportsPanel";

/** The conversations themselves, and what they add up to. */
export default function ChatTabs() {
  const [tab, setTab] = useState<"chats" | "reports">("chats");

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(
          [
            ["chats", "Харилцан яриа"],
            ["reports", "Тайлан"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`font-extrabold text-[.88rem] px-5 py-2.5 rounded-full transition-colors ${
              tab === value ? "bg-blue text-white" : "bg-bg-soft text-ink-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "chats" ? <ChatPanel /> : <ChatReportsPanel />}
    </div>
  );
}
