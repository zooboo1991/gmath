"use client";

import { useMemo, useState } from "react";
import type { WaitlistRequestWithUser } from "@/lib/waitlist";
import { INPUT_CLASS } from "@/components/admin/panels/shared";

const STATUS_LABEL: Record<string, string> = {
  waiting: "Хүлээж байна",
  notified: "Мэдэгдсэн",
  closed: "Хаасан",
};

/**
 * Who is waiting for a class that does not exist yet, grouped by the grade
 * they asked for — that grouping is the whole answer to "which class should
 * we open next".
 *
 * Telling them reuses the notification machinery: the selected people are
 * sent one, and their rows are marked so the same group is not told twice.
 */
export default function WaitlistPanel({
  initialRequests,
}: {
  initialRequests: WaitlistRequestWithUser[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showClosed, setShowClosed] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"site" | "both">("site");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const visible = showClosed ? requests : requests.filter((r) => r.status !== "closed");

  // Grouped by grade, biggest queue first: the grade with eleven waiting is
  // the class to open, and it should not have to be counted by eye.
  const groups = useMemo(() => {
    const byGrade = new Map<string, WaitlistRequestWithUser[]>();
    for (const request of visible) {
      const list = byGrade.get(request.grade) ?? [];
      list.push(request);
      byGrade.set(request.grade, list);
    }
    return [...byGrade.entries()]
      .map(([grade, list]) => ({ grade, list }))
      .sort((a, b) => b.list.length - a.list.length);
  }, [visible]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectGrade = (list: WaitlistRequestWithUser[]) =>
    setSelected((current) => {
      const next = new Set(current);
      const all = list.every((r) => next.has(r.id));
      for (const request of list) {
        if (all) next.delete(request.id);
        else next.add(request.id);
      }
      return next;
    });

  const chosen = requests.filter((r) => selected.has(r.id));

  const setStatus = async (ids: string[], status: "waiting" | "notified" | "closed") => {
    const res = await fetch("/api/admin/waitlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Хадгалахад алдаа гарлаа");
      return false;
    }
    setRequests((current) =>
      current.map((r) => (ids.includes(r.id) ? { ...r, status } : r))
    );
    return true;
  };

  const notify = async () => {
    const userIds = [...new Set(chosen.map((r) => r.userId))];
    if (userIds.length === 0) {
      setError("Хэнд илгээхээ сонгоно уу");
      return;
    }
    if (!title.trim() || !body.trim()) {
      setError("Гарчиг, мессежээ бөглөнө үү");
      return;
    }
    if (!confirm(`${userIds.length} хүнд мэдэгдэл илгээх үү?`)) return;

    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          targetType: "users",
          userIds,
          channel,
          link: "/courses",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Илгээхэд алдаа гарлаа");
        return;
      }
      // Only mark them once the message actually went out.
      await setStatus([...selected], "notified");
      setDone(`${userIds.length} хүнд мэдэгдэл илгээлээ.`);
      setSelected(new Set());
      setTitle("");
      setBody("");
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  if (requests.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-8 text-center">
        <p className="text-ink-3 font-semibold">
          Одоогоор хүлээлгийн жагсаалтад бүртгүүлсэн хүн алга байна.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <b className="font-extrabold text-[1rem] block">
              {visible.filter((r) => r.status === "waiting").length} хүн хүлээж байна
            </b>
            <span className="text-ink-3 font-semibold text-[.85rem]">
              {groups.length} ангиас хүсэлт ирсэн
            </span>
          </div>
          <label className="flex items-center gap-2 text-[.85rem] font-bold text-ink-2">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
            />
            Хаасныг харуулах
          </label>
        </div>
      </div>

      {groups.map(({ grade, list }) => (
        <div key={grade} className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <b className="font-extrabold text-[1rem]">
              {grade} · {list.length} хүн
            </b>
            <button
              type="button"
              onClick={() => selectGrade(list)}
              className="font-extrabold text-[.85rem] text-blue-strong"
            >
              Бүгдийг сонгох
            </button>
          </div>
          <div className="flex flex-col">
            {list.map((request) => (
              <label
                key={request.id}
                className="flex items-start gap-3 py-2.5 border-b border-line last:border-0 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(request.id)}
                  onChange={() => toggle(request.id)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <b className="font-extrabold text-[.9rem]">
                    {request.user ? `${request.user.lastName} ${request.user.firstName}` : "Устсан хэрэглэгч"}
                    {request.user?.phone ? ` · ${request.user.phone}` : ""}
                  </b>
                  {request.note && (
                    <span className="text-ink-2 font-medium text-[.85rem] block mt-0.5">
                      {request.note}
                    </span>
                  )}
                </div>
                <span
                  className={`shrink-0 text-[.75rem] font-extrabold px-2.5 py-1 rounded-full ${
                    request.status === "waiting"
                      ? "text-gold-strong bg-gold-soft"
                      : request.status === "notified"
                        ? "text-green bg-green-soft"
                        : "text-ink-3 bg-bg-soft"
                  }`}
                >
                  {STATUS_LABEL[request.status] ?? request.status}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* Telling the chosen group their class is open. */}
      <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
        <h3 className="font-extrabold text-[1rem]">Сонгосон хүмүүст мэдэгдэх ({chosen.length})</h3>
        <p className="text-ink-3 font-semibold text-[.85rem] mt-1">
          Анги нээгдсэн тухай мэдэгдэл очно. Дарахад Сургалтууд хуудас руу орно.
        </p>
        <div className="flex flex-col gap-2.5 mt-3.5">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Гарчиг — жишээ: 6-р ангийн шинэ бүлэг нээгдлээ"
            className={INPUT_CLASS}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Хичээллэх өдөр, цаг, бүртгэлийн мэдээллээ бичнэ үү."
            className={`${INPUT_CLASS} resize-y`}
          />
          <label className="flex items-center gap-2 text-[.85rem] font-bold text-ink-2">
            <input
              type="checkbox"
              checked={channel === "both"}
              onChange={(e) => setChannel(e.target.checked ? "both" : "site")}
            />
            SMS-ээр бас илгээх
          </label>
        </div>

        {error && <p className="text-red-soft font-semibold text-[.85rem] mt-3">{error}</p>}
        {done && <p className="text-green font-extrabold text-[.88rem] mt-3">{done}</p>}

        <div className="flex items-center gap-2.5 flex-wrap mt-4">
          <button
            type="button"
            disabled={busy || chosen.length === 0}
            onClick={notify}
            className="font-extrabold text-[.9rem] text-white bg-blue shadow-blue rounded-full px-6 py-3 disabled:opacity-50"
          >
            {busy ? "Илгээж байна…" : "Мэдэгдэл илгээх"}
          </button>
          <button
            type="button"
            disabled={busy || chosen.length === 0}
            onClick={async () => {
              if (!confirm(`${chosen.length} хүсэлтийг хаах уу?`)) return;
              setBusy(true);
              await setStatus([...selected], "closed");
              setSelected(new Set());
              setBusy(false);
            }}
            className="font-extrabold text-[.88rem] text-ink-2 bg-bg-soft rounded-full px-5 py-3 disabled:opacity-50"
          >
            Хүсэлтийг хаах
          </button>
        </div>
      </div>
    </div>
  );
}
