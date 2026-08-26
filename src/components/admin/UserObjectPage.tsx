"use client";

import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { useState } from "react";
import type {
  AdminChatConversation,
  LoginLog,
  PublicUser,
  RegistrationPayment,
  RegistrationWithGroup,
} from "@/lib/db";
import ChatTranscript from "@/components/admin/ChatTranscript";
import { KpiTile } from "@/components/admin/AdminObjectPageParts";
import { IconArrowLeft, IconCheckCircle, IconClock } from "@/components/icons";
import { describeUserAgent } from "@/lib/userAgent";
import { payMethodLabel, programAdminHref, registrationBalance } from "@/lib/registration";
import { formatMnt } from "@/lib/price";
import type { TimelineEvent } from "@/lib/userTimeline";

type ObjectTab = "info" | "payments" | "devices" | "chat" | "timeline";

/** Дохионы өнгө: аль төрлийн үйл явдал болохыг цэгээр нь ялгана. */
const TIMELINE_DOT: Record<TimelineEvent["kind"], string> = {
  account: "bg-ink-3",
  course: "bg-blue",
  payment: "bg-green",
  lesson: "bg-gold",
  assessment: "bg-blue-strong",
  chat: "bg-ink-2",
  admin: "bg-red-soft",
  other: "bg-line-2",
};

/** Today in Mongolia, for judging whether a promised date has passed. */
function todayIso(): string {
  const local = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function StatusBadge({ status }: { status: RegistrationWithGroup["status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-green bg-green-soft px-3 py-1 rounded-full">
        <IconCheckCircle className="w-3 h-3" /> Идэвхтэй
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-ink-3 bg-bg-soft px-3 py-1 rounded-full">
        Цуцалсан
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-gold-strong bg-gold-soft px-3 py-1 rounded-full">
      <IconClock className="w-3 h-3" /> Хүлээгдэж буй
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-flat px-6 py-5">
      <h3 className="font-extrabold text-[1rem] text-ink mb-4">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0">
      <span className="font-bold text-[.88rem] text-ink-3">{label}</span>
      <span className="font-extrabold text-[.9rem] text-right">{value}</span>
    </div>
  );
}

function AnchorTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 font-extrabold text-[.86rem] px-4 py-3 border-b-[2.5px] transition-colors ${
        active ? "border-blue text-blue-strong" : "border-transparent text-ink-3 hover:text-ink-2"
      }`}
    >
      {label}
    </button>
  );
}

function formatLogDate(iso: string) {
  // Deterministic (see lib/dateFormat.ts) — the locale version hydration-mismatched.
  return formatDateTime(iso);
}

export default function UserObjectPage({
  user,
  registrations,
  loginLogs,
  chatConversations,
  timeline,
  payments,
}: {
  user: PublicUser;
  registrations: RegistrationWithGroup[];
  loginLogs: LoginLog[];
  chatConversations: AdminChatConversation[];
  timeline: TimelineEvent[];
  payments: RegistrationPayment[];
}) {
  const [tab, setTab] = useState<ObjectTab>("info");
  const [isTest, setIsTest] = useState(Boolean(user.isTest));
  const [savingTest, setSavingTest] = useState(false);
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null);
  /** Keeps this account's money out of the school's books, or puts it back. */
  const toggleTest = async () => {
    const next = !isTest;
    if (
      next &&
      !confirm(
        "Энэ аккаунтыг тестийн гэж тэмдэглэх үү? Түүний бүртгэл, төлбөр хяналтын самбарын мөнгө болон аналитикийн тоонд орохгүй болно."
      )
    ) {
      return;
    }
    setSavingTest(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTest: next }),
      });
      if (res.ok) setIsTest(next);
    } finally {
      setSavingTest(false);
    }
  };

  const live = registrations.filter((r) => r.status !== "cancelled");
  const active = registrations.filter((r) => r.status === "active");
  const pending = registrations.filter((r) => r.status === "pending");
  const cancelled = registrations.filter((r) => r.status === "cancelled");

  // Fee, received and outstanding across everything this student is on.
  const money = live.reduce(
    (sum, registration) => {
      const recorded = payments
        .filter((p) => p.registrationId === registration.id)
        .reduce((total, p) => total + p.amount, 0);
      const totals = registrationBalance(registration, recorded);
      return {
        due: sum.due + totals.due,
        paid: sum.paid + totals.paid,
        balance: sum.balance + totals.balance,
      };
    },
    { due: 0, paid: 0, balance: 0 }
  );

  return (
    <div className="min-h-screen bg-bg-soft">
      {/* One header block, one name. The old design had a separate sticky
          "← Буцах | Нэр" strip stacked above this profile row, which repeated
          the name twice on screen; the back control is now an icon inside the
          profile row itself. */}
      <header className="bg-surface border-b border-line">
        <div className="wrap py-5 flex items-center justify-between gap-5 flex-wrap">
          <div className="flex items-center gap-3.5 min-w-0">
            <Link
              href="/admin/users"
              title="Хэрэглэгчид рүү буцах"
              aria-label="Хэрэглэгчид рүү буцах"
              className="w-9 h-9 rounded-full border border-line grid place-items-center text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
            >
              <IconArrowLeft className="w-4 h-4" />
            </Link>
            <span className="w-14 h-14 rounded-full bg-blue-soft text-blue-strong grid place-items-center font-extrabold text-[1.3rem] shrink-0">
              {(user.lastName?.[0] ?? "") + (user.firstName?.[0] ?? "") || "?"}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <b className="text-[1.15rem] leading-tight truncate">
                  {user.lastName || user.firstName ? `${user.lastName} ${user.firstName}` : "Мэдээлэл дутуу"}
                </b>
                <span
                  className={`text-[.72rem] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                    user.role === "teacher" ? "text-gold-strong bg-gold-soft" : "text-blue-strong bg-blue-soft"
                  }`}
                >
                  {user.role === "teacher" ? "Багш" : "Сурагч"}
                </span>
                {isTest && (
                  <span className="text-[.72rem] font-extrabold px-2.5 py-1 rounded-full text-gold-strong bg-gold-soft">
                    Тестийн аккаунт
                  </span>
                )}
              </div>
              <span className="text-ink-3 font-semibold text-[.85rem]">
                {user.phone}
                {" · Бүртгүүлсэн: "}
                {formatDate(user.createdAt)}
              </span>
            </div>
          </div>
          {/* Full width below nav: the three tiles plus the profile block no
              longer fit on one line once the back icon is in the row, and
              w-full makes them wrap onto their own line instead of pushing the
              page into a horizontal scroll. */}
          <div className="grid grid-cols-3 gap-3 shrink-0 w-full nav:w-auto">
            <KpiTile label="Сургалт" value={String(live.length)} />
            <KpiTile label="Идэвхтэй" value={String(active.length)} tone="green" />
            <KpiTile label="Чат" value={String(chatConversations.length)} tone="blue" />
          </div>
        </div>

        <div className="wrap flex gap-1 overflow-x-auto">
          <AnchorTab label="Ерөнхий мэдээлэл" active={tab === "info"} onClick={() => setTab("info")} />
          <AnchorTab label="Төлбөр" active={tab === "payments"} onClick={() => setTab("payments")} />
          <AnchorTab
            label={`Төхөөрөмж${loginLogs.length ? ` (${loginLogs.length})` : ""}`}
            active={tab === "devices"}
            onClick={() => setTab("devices")}
          />
          <AnchorTab
            label={`Чат${chatConversations.length ? ` (${chatConversations.length})` : ""}`}
            active={tab === "chat"}
            onClick={() => setTab("chat")}
          />
          <AnchorTab
            label={`Түүх${timeline.length ? ` (${timeline.length})` : ""}`}
            active={tab === "timeline"}
            onClick={() => setTab("timeline")}
          />
        </div>
      </header>

      <div className="wrap max-w-[720px] py-8 flex flex-col gap-5">
        {tab === "info" && (
          <>
            <Card title="Хувийн мэдээлэл">
              <div className="flex flex-col">
                <InfoRow label="Утас" value={user.phone} />
                <InfoRow label="Имэйл" value={user.email} />
                <InfoRow label="Аймаг/Хот" value={user.province} />
                <InfoRow label="Сум/Дүүрэг" value={user.district} />
                <InfoRow label="Сургууль" value={user.school} />
                <InfoRow label="Анги" value={user.grade} />
                <InfoRow label="Facebook" value={user.facebook} />
                <InfoRow label="Бүртгүүлсэн огноо" value={formatDate(user.createdAt)} />
              </div>

              {/* The school's own test account enrols and pays for real; the
                  books must not treat that as income. */}
              <div className="mt-4 pt-4 border-t border-line flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <b className="font-extrabold text-[.92rem] block">Тестийн аккаунт</b>
                  <span className="text-ink-3 font-semibold text-[.82rem]">
                    Тэмдэглэвэл энэ хүний бүртгэл, төлбөр самбарын мөнгө, аналитикийн тоонд орохгүй.
                  </span>
                </div>
                <button
                  type="button"
                  disabled={savingTest}
                  onClick={toggleTest}
                  className={`shrink-0 font-extrabold text-[.85rem] px-5 py-2.5 rounded-full disabled:opacity-50 ${
                    isTest ? "bg-gold text-gold-ink" : "bg-bg-soft text-ink-2"
                  }`}
                >
                  {savingTest ? "…" : isTest ? "Тест — унтраах" : "Тест гэж тэмдэглэх"}
                </button>
              </div>
            </Card>

            <Card title={`Сургалт, төлбөрийн түүх (${registrations.length})`}>
              {registrations.length === 0 ? (
                <p className="text-ink-3 font-semibold text-[.9rem]">Бүртгэл алга байна.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {/* Cancelled rows are shown too, last and faded: the header
                      counted them while the list left them out, so a student
                      who moved to another course read as "2 сургалт" with one
                      card under it. */}
                  {[
                    ...[...active, ...pending].sort(
                      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    ),
                    ...cancelled.sort(
                      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    ),
                  ].map((r) => (
                      <div
                        key={r.id}
                        className={`rounded-md px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap ${
                          r.status === "cancelled" ? "bg-surface-2 opacity-70" : "bg-bg-soft"
                        }`}
                      >
                        <div>
                          <Link
                            href={programAdminHref(r.programId)}
                            className="font-extrabold block text-[.92rem] hover:text-blue-strong hover:underline"
                          >
                            {r.programLabel}
                          </Link>
                          <span className="text-ink-3 font-semibold text-[.82rem]">
                            {r.price} · {payMethodLabel(r.payMethod)} ·{" "}
                            {formatDate(r.createdAt)}
                          </span>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </>
        )}

        {tab === "payments" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <KpiTile label="Нийт төлөх" value={formatMnt(money.due)} />
              <KpiTile label="Төлсөн" value={formatMnt(money.paid)} tone="green" />
              <KpiTile
                label="Үлдэгдэл"
                value={formatMnt(money.balance)}
                tone={money.balance > 0 ? "gold" : "green"}
              />
            </div>

            {live.length === 0 ? (
              <Card title="Төлбөр">
                <p className="text-ink-3 font-semibold text-[.9rem]">Идэвхтэй бүртгэл алга байна.</p>
              </Card>
            ) : (
              live.map((registration) => {
                const rows = payments.filter((p) => p.registrationId === registration.id);
                const totals = registrationBalance(
                  registration,
                  rows.reduce((sum, p) => sum + p.amount, 0)
                );
                const overdue =
                  totals.balance > 0 &&
                  Boolean(registration.installmentDueDate) &&
                  registration.installmentDueDate! < todayIso();

                return (
                  <Card key={registration.id} title={registration.programLabel}>
                    <div className="flex flex-col">
                      <InfoRow label="Төлөх дүн" value={formatMnt(totals.due)} />
                      <InfoRow label="Төлсөн" value={formatMnt(totals.paid)} />
                      <InfoRow
                        label="Үлдэгдэл"
                        value={totals.balance === 0 ? "Бүрэн төлсөн" : formatMnt(totals.balance)}
                      />
                      <InfoRow label="Төлбөрийн хэлбэр" value={payMethodLabel(registration.payMethod)} />
                    </div>

                    {registration.installmentDueDate && totals.balance > 0 && (
                      <p
                        className={`font-extrabold text-[.88rem] rounded-md px-4 py-3 mt-3 ${
                          overdue
                            ? "text-red-soft bg-[oklch(0.97_0.03_25)]"
                            : "text-gold-strong bg-gold-soft"
                        }`}
                      >
                        {overdue ? "Хугацаа хэтэрсэн" : "Дараагийн төлөлт"}:{" "}
                        {registration.installmentDueDate.replaceAll("-", ".")} —{" "}
                        {formatMnt(totals.balance)}
                      </p>
                    )}

                    <div className="mt-4 pt-4 border-t border-line">
                      <span className="text-[.8rem] font-extrabold text-ink-3 block mb-2">
                        Хийсэн төлөлт ({rows.length})
                      </span>
                      {rows.length === 0 ? (
                        <p className="text-ink-3 font-semibold text-[.88rem]">
                          {totals.settledByGateway
                            ? "QPay-ээр бүрэн төлөгдсөн тул тусад нь бүртгээгүй."
                            : "Бүртгэсэн төлөлт алга байна."}
                        </p>
                      ) : (
                        <div className="flex flex-col">
                          {[...rows]
                            .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
                            .map((payment) => (
                              <div
                                key={payment.id}
                                className="flex items-center justify-between gap-4 py-2 border-b border-line last:border-0"
                              >
                                <span className="text-ink-2 font-semibold text-[.88rem]">
                                  {formatDate(payment.paidAt)}
                                </span>
                                <b className="font-extrabold text-[.9rem] tabular-nums">
                                  {formatMnt(payment.amount)}
                                </b>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })
            )}

            {cancelled.length > 0 && (
              <Card title={`Цуцалсан бүртгэл (${cancelled.length})`}>
                <div className="flex flex-col">
                  {cancelled.map((registration) => (
                    <InfoRow
                      key={registration.id}
                      label={registration.programLabel}
                      value={`${registration.price} · ${formatDate(registration.createdAt)}`}
                    />
                  ))}
                </div>
                <p className="text-ink-3 font-semibold text-[.82rem] mt-2">
                  Цуцалсан бүртгэл төлбөрийн тооцоонд ороогүй.
                </p>
              </Card>
            )}
          </>
        )}

        {tab === "timeline" && (
          <Card title="Хэрэглэгчийн бүх түүх">
            <p className="text-ink-3 font-semibold text-[.85rem] mb-4">
              Бүртгүүлснээс хойших бүх үйлдэл: сургалт, төлбөр, хичээл, шалгалт, чат, нэвтрэлт,
              админаас хийсэн өөрчлөлт — шинэ нь дээрээ.
            </p>
            {timeline.length === 0 ? (
              <p className="text-ink-3 font-semibold text-[.9rem]">Түүх алга байна.</p>
            ) : (
              <div className="flex flex-col">
                {timeline.map((event, i) => (
                  <div key={`${event.at}-${i}`} className="flex gap-3.5 group">
                    {/* The rail: a dot per event, a line joining them. */}
                    <div className="flex flex-col items-center shrink-0 pt-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${TIMELINE_DOT[event.kind]}`} />
                      <span className="w-px flex-1 bg-line group-last:hidden" />
                    </div>
                    <div className="pb-4 min-w-0">
                      <b className="font-extrabold text-[.9rem] block">{event.title}</b>
                      <span className="text-ink-3 font-semibold text-[.8rem] block">
                        {/* A recorded payment carries the day the admin typed,
                            with no clock on it — inventing one would be a lie. */}
                        {event.at.length === 10 ? formatDate(event.at) : formatDateTime(event.at)}
                        {event.detail ? ` · ${event.detail}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === "devices" && (
          <Card title={`Нэвтэрсэн төхөөрөмжийн лог (${loginLogs.length})`}>
            {loginLogs.length === 0 ? (
              <p className="text-ink-3 font-semibold text-[.9rem]">Нэвтэрсэн түүх алга байна.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {loginLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-bg-soft rounded-md px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div>
                      <b className="font-extrabold block text-[.92rem]">{describeUserAgent(log.userAgent)}</b>
                      <span className="text-ink-3 font-semibold text-[.82rem]">
                        {log.ip ?? "IP тодорхойгүй"} · {formatLogDate(log.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === "chat" && (
          <Card title={`Чатын түүх (${chatConversations.length})`}>
            {chatConversations.length === 0 ? (
              <p className="text-ink-3 font-semibold text-[.9rem]">Чатын түүх алга байна.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {chatConversations.map((c) => (
                  <div key={c.id} className="bg-bg-soft rounded-md px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => setExpandedChatId(expandedChatId === c.id ? null : c.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center text-[.72rem] font-extrabold px-2.5 py-0.5 rounded-full ${
                              c.channel === "messenger"
                                ? "text-gold-strong bg-gold-soft"
                                : "text-blue-strong bg-blue-soft"
                            }`}
                          >
                            {c.channel === "messenger" ? "Messenger" : "Вэб"}
                          </span>
                          <span className="text-ink-3 font-semibold text-[.82rem]">{c.messageCount} мессеж</span>
                        </div>
                        <span className="text-ink-3 font-semibold text-[.78rem] shrink-0">
                          {formatLogDate(c.lastMessage?.createdAt ?? c.startedAt)}
                        </span>
                      </div>
                      {c.lastMessage && (
                        <p className="text-ink-3 font-medium text-[.83rem] mt-1 truncate">
                          {c.lastMessage.role === "user" ? "Хэрэглэгч: " : "Бот: "}
                          {c.lastMessage.content}
                        </p>
                      )}
                    </button>
                    {expandedChatId === c.id && <ChatTranscript conversationId={c.id} />}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
