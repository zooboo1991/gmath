"use client";

import { useEffect, useState } from "react";
import type { AdminChatConversation, ChatIssue } from "@/lib/db";
import ChatTranscript from "@/components/admin/ChatTranscript";

export default function ChatPanel() {
  const [state, setState] = useState<{
    status: "loading" | "done" | "error";
    conversations?: AdminChatConversation[];
    issues?: ChatIssue[];
  }>({ status: "loading" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/chats")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => {
        if (!cancelled) setState({ status: "done", conversations: json.conversations, issues: json.issues });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setIssueStatus = async (id: string, status: "new" | "resolved") => {
    // Optimistic flip; reverted by a reload if the PUT fails, which is rare
    // enough not to warrant per-row error plumbing.
    setState((s) => ({
      ...s,
      issues: s.issues?.map((i) =>
        i.id === id ? { ...i, status, resolvedAt: status === "resolved" ? new Date().toISOString() : undefined } : i
      ),
    }));
    await fetch(`/api/admin/chat-issues/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  };

  const channelBadge = (channel: string) =>
    channel === "messenger" ? (
      <span className="inline-flex items-center text-[.72rem] font-extrabold px-2.5 py-0.5 rounded-full text-gold-strong bg-gold-soft shrink-0">
        Messenger
      </span>
    ) : (
      <span className="inline-flex items-center text-[.72rem] font-extrabold px-2.5 py-0.5 rounded-full text-blue-strong bg-blue-soft shrink-0">
        Вэб
      </span>
    );

  const userLabel = (user?: { lastName: string; firstName: string; phone: string }) =>
    user ? `${user.lastName} ${user.firstName} (${user.phone})` : "Зочин";

  // Unresolved complaints float to the top of their card; within a group the
  // server's newest-first order is preserved.
  const sortedIssues = [...(state.issues ?? [])].sort((a, b) =>
    a.status === b.status ? 0 : a.status === "new" ? -1 : 1
  );
  const newIssueCount = sortedIssues.filter((i) => i.status === "new").length;

  return (
    <div className="flex flex-col gap-3">
      {state.status === "loading" && (
        <div className="card-flat px-6 py-6">
          <p className="text-ink-3 font-semibold text-[.9rem]">Ачааллаж байна…</p>
        </div>
      )}
      {state.status === "error" && (
        <div className="card-flat px-6 py-6">
          <p className="text-red-soft font-semibold text-[.9rem]">Ачаалахад алдаа гарлаа. Дахин оролдоно уу.</p>
        </div>
      )}

      {state.status === "done" && sortedIssues.length > 0 && (
        <div className="card-flat px-6 py-6">
          <h3 className="font-extrabold text-[1.05rem]">
            Гомдол ({sortedIssues.length}){newIssueCount > 0 && <span className="text-red-soft"> — {newIssueCount} шинэ</span>}
          </h3>
          <p className="text-ink-3 font-semibold text-[.85rem] mt-1">
            Чатботын харилцан ярианаас автоматаар илэрсэн асуудлууд.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            {sortedIssues.map((issue) => (
              <div key={issue.id} className={`bg-bg-soft rounded-md px-4 py-3.5 ${issue.status === "resolved" ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {issue.status === "new" ? (
                        <span className="inline-flex items-center text-[.72rem] font-extrabold px-2.5 py-0.5 rounded-full text-red-soft bg-red-soft/10">
                          Шинэ
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[.72rem] font-extrabold px-2.5 py-0.5 rounded-full text-green bg-green-soft">
                          Шийдсэн
                        </span>
                      )}
                      {channelBadge(issue.channel)}
                      <b className="font-extrabold text-[.9rem]">{userLabel(issue.user)}</b>
                    </div>
                    <p className="text-ink-2 font-medium text-[.88rem] mt-1.5 whitespace-pre-wrap">{issue.message}</p>
                    <span className="text-ink-3 font-semibold text-[.75rem] mt-1 block">
                      {new Date(issue.createdAt).toLocaleString("mn-MN")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === issue.conversationId ? null : issue.conversationId)}
                      className="text-[.8rem] font-extrabold text-ink-2 bg-surface px-3.5 py-1.5 rounded-full border border-line"
                    >
                      {expandedId === issue.conversationId ? "Хаах" : "Яриа харах"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIssueStatus(issue.id, issue.status === "new" ? "resolved" : "new")}
                      className={`text-[.8rem] font-extrabold px-3.5 py-1.5 rounded-full ${
                        issue.status === "new" ? "text-white bg-green" : "text-ink-2 bg-surface border border-line"
                      }`}
                    >
                      {issue.status === "new" ? "Шийдсэн" : "Буцаах"}
                    </button>
                  </div>
                </div>
                {expandedId === issue.conversationId && <ChatTranscript conversationId={issue.conversationId} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.status === "done" && (
        <div className="card-flat px-6 py-6">
          <h3 className="font-extrabold text-[1.05rem]">Харилцан яриа ({state.conversations?.length ?? 0})</h3>
          <p className="text-ink-3 font-semibold text-[.85rem] mt-1">
            Вэб болон Messenger дээрх чатботын бүх яриа. Мөр дээр дарж бүрэн харна.
          </p>
          {state.conversations?.length === 0 && (
            <p className="text-ink-3 font-semibold text-[.9rem] mt-4">Одоогоор яриа алга.</p>
          )}
          <div className="mt-4 flex flex-col">
            {state.conversations?.map((c) => (
              <div key={c.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  className="w-full text-left py-3 hover:bg-bg-soft transition-colors rounded-sm px-1"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {channelBadge(c.channel)}
                      <b className="font-extrabold text-[.9rem]">{userLabel(c.user)}</b>
                      <span className="text-ink-3 font-semibold text-[.8rem]">{c.messageCount} мессеж</span>
                    </div>
                    <span className="text-ink-3 font-semibold text-[.78rem] shrink-0">
                      {new Date(c.lastMessage?.createdAt ?? c.startedAt).toLocaleString("mn-MN")}
                    </span>
                  </div>
                  {c.lastMessage && (
                    <p className="text-ink-3 font-medium text-[.83rem] mt-1 truncate">
                      {c.lastMessage.role === "user" ? "Хэрэглэгч: " : "Бот: "}
                      {c.lastMessage.content}
                    </p>
                  )}
                </button>
                {expandedId === c.id && (
                  <div className="px-1 pb-2">
                    <ChatTranscript conversationId={c.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
