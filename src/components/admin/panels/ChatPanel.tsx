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
  const [menuState, setMenuState] = useState<{ busy: boolean; message?: string; error?: boolean }>({ busy: false });

  // Polled, not fetched once: while an admin has taken a conversation over
  // they need the list (and its "waiting" markers) to move on its own. 8s is
  // slow enough to be free and fast enough that nobody sits refreshing.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/admin/chats")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((json) => {
          if (!cancelled) setState({ status: "done", conversations: json.conversations, issues: json.issues });
        })
        .catch(() => {
          // A failed refresh keeps the list that's already on screen.
          if (!cancelled) setState((prev) => (prev.status === "done" ? prev : { status: "error" }));
        });

    void load();
    const timer = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  /** Flips who answers this conversation. Optimistic — the poll corrects it if the call fails. */
  const setMode = async (id: string, mode: "bot" | "admin") => {
    setState((s) => ({
      ...s,
      conversations: s.conversations?.map((c) => (c.id === id ? { ...c, mode } : c)),
    }));
    await fetch(`/api/admin/chats/${id}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }).catch(() => {});
  };

  /**
   * Pushes the greeting + persistent menu to the Facebook Page. Lives here
   * because it's chatbot plumbing, and it has to run on the server that holds
   * the Page token.
   */
  const applyMessengerMenu = async () => {
    setMenuState({ busy: true });
    try {
      const res = await fetch("/api/admin/messenger/profile", { method: "POST" });
      const json = await res.json();
      setMenuState(
        res.ok
          ? { busy: false, message: "Messenger цэс болон мэндчилгээ шинэчлэгдлээ." }
          : { busy: false, error: true, message: json.error ?? "Шинэчлэхэд алдаа гарлаа." }
      );
    } catch {
      setMenuState({ busy: false, error: true, message: "Сүлжээний алдаа гарлаа." });
    }
  };

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

  // Taken over by a human, and the last thing said was the visitor's — i.e.
  // somebody is sitting there waiting for an answer.
  const waitingCount = (state.conversations ?? []).filter(
    (c) => c.mode === "admin" && c.lastMessage?.role === "user"
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="card-flat px-6 py-6">
        <h3 className="font-extrabold text-[1.05rem]">Messenger цэс</h3>
        <p className="text-ink-3 font-semibold text-[.85rem] mt-1 max-w-[68ch]">
          Facebook хуудасны чат доор байнга харагдах цэс, мэндчилгээг вэб сайт руу чиглүүлж
          тохируулна. Цэсний мөрүүд шууд браузер нээдэг тул Meta AI-аас хамаарахгүй. Сургалт, үнэ
          зэрэг мэдээлэл өөрчлөгдөхөд дахин дарах шаардлагагүй — цэс нь зөвхөн холбоос агуулна.
        </p>
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <button
            type="button"
            disabled={menuState.busy}
            onClick={applyMessengerMenu}
            className="text-[.85rem] font-extrabold rounded-full bg-blue text-white shadow-blue px-5 py-2.5 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {menuState.busy ? "Тохируулж байна…" : "Цэсийг шинэчлэх"}
          </button>
          {menuState.message && (
            <span className={`text-[.85rem] font-bold ${menuState.error ? "text-red-soft" : "text-green"}`}>
              {menuState.message}
            </span>
          )}
        </div>
      </div>

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
          <h3 className="font-extrabold text-[1.05rem]">
            Харилцан яриа ({state.conversations?.length ?? 0})
            {waitingCount > 0 && (
              <span className="text-gold-strong"> — {waitingCount} хариу хүлээж байна</span>
            )}
          </h3>
          <p className="text-ink-3 font-semibold text-[.85rem] mt-1">
            Вэб болон Messenger дээрх чатботын бүх яриа. Мөр дээр дарж бүрэн харах, шаардлагатай бол
            ботыг зогсоож өөрөө хариулна.
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
                      {c.mode === "admin" && (
                        <span className="inline-flex items-center text-[.72rem] font-extrabold px-2.5 py-0.5 rounded-full text-gold-strong bg-gold-soft shrink-0">
                          Бот зогссон
                        </span>
                      )}
                      {c.mode === "admin" && c.lastMessage?.role === "user" && (
                        <span className="inline-flex items-center text-[.72rem] font-extrabold px-2.5 py-0.5 rounded-full text-red-soft bg-[oklch(0.95_0.03_25)] shrink-0">
                          Хариу хүлээж байна
                        </span>
                      )}
                    </div>
                    <span className="text-ink-3 font-semibold text-[.78rem] shrink-0">
                      {new Date(c.lastMessage?.createdAt ?? c.startedAt).toLocaleString("mn-MN")}
                    </span>
                  </div>
                  {c.lastMessage && (
                    <p className="text-ink-3 font-medium text-[.83rem] mt-1 truncate">
                      {c.lastMessage.role === "user"
                        ? "Хэрэглэгч: "
                        : c.lastMessage.role === "admin"
                        ? "Багш: "
                        : "Бот: "}
                      {c.lastMessage.content}
                    </p>
                  )}
                </button>
                {expandedId === c.id && (
                  <div className="px-1 pb-3">
                    <ChatReply conversation={c} onSetMode={setMode} />
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

/**
 * The expanded conversation: transcript plus everything needed to answer it by
 * hand. Kept in this file rather than a shared component because the reply flow
 * only makes sense inside the admin chat list.
 *
 * Sending a message takes the conversation over server-side, so the bot can't
 * answer on top of a half-typed human reply — the "Өөрөө хариулах" button is
 * only for pausing the bot *before* writing anything.
 */
function ChatReply({
  conversation,
  onSetMode,
}: {
  conversation: AdminChatConversation;
  onSetMode: (id: string, mode: "bot" | "admin") => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/chats/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Илгээхэд алдаа гарлаа");
        return;
      }
      setText("");
      onSetMode(conversation.id, "admin");
      setRefreshKey((k) => k + 1);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  const isMessenger = conversation.channel === "messenger";

  return (
    <>
      {/* Poll only while the row is open: a closed row costs nothing. */}
      <ChatTranscript conversationId={conversation.id} pollMs={5000} refreshKey={refreshKey} />

      {isMessenger ? (
        <p className="text-ink-3 font-semibold text-[.83rem] bg-bg-soft rounded-md px-3.5 py-2.5">
          Энэ яриа Messenger дээр байна. Гараар хариулахын тулд Facebook хуудасны inbox-оос бичнэ үү —
          энд бичсэн мессеж тэр хүнд хүрэхгүй.
        </p>
      ) : (
        <div className="bg-bg-soft rounded-md px-3.5 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
            <span className="text-[.83rem] font-extrabold text-ink-2">
              {conversation.mode === "admin" ? "Бот зогссон — та хариулж байна" : "Бот хариулж байна"}
            </span>
            <button
              type="button"
              onClick={() => onSetMode(conversation.id, conversation.mode === "admin" ? "bot" : "admin")}
              className="text-[.8rem] font-extrabold text-ink-2 bg-surface border border-line px-3.5 py-1.5 rounded-full"
            >
              {conversation.mode === "admin" ? "Ботод буцаах" : "Ботыг зогсоох"}
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Хэрэглэгчид бичих…"
            className="w-full px-3.5 py-2.5 rounded-xs border-[1.5px] border-line-2 bg-surface text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue"
          />
          <div className="flex items-center gap-2.5 mt-2">
            <button
              type="button"
              disabled={sending || !text.trim()}
              onClick={send}
              className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2 rounded-full disabled:opacity-50"
            >
              {sending ? "Илгээж байна…" : "Илгээх"}
            </button>
            <span className="text-ink-3 font-semibold text-[.78rem]">
              Илгээмэгц бот автоматаар зогсоно. Хэрэглэгч 4 секундын дотор харна.
            </span>
          </div>
          {error && <p className="text-red-soft font-semibold text-[.83rem] mt-2">{error}</p>}
        </div>
      )}
    </>
  );
}
