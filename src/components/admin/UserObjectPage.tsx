"use client";

import Link from "next/link";
import { useState } from "react";
import type { LoginLog, PublicUser, RegistrationWithGroup } from "@/lib/db";
import { IconCheckCircle, IconClock } from "@/components/icons";
import { describeUserAgent } from "@/lib/userAgent";
import { payMethodLabel } from "@/lib/registration";

type ObjectTab = "info" | "devices";

function StatusBadge({ status }: { status: RegistrationWithGroup["status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-green bg-green-soft px-3 py-1 rounded-full">
        <IconCheckCircle className="w-3 h-3" /> Идэвхтэй
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
  return new Date(iso).toLocaleString("mn-MN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UserObjectPage({
  user,
  registrations,
  loginLogs,
}: {
  user: PublicUser;
  registrations: RegistrationWithGroup[];
  loginLogs: LoginLog[];
}) {
  const [tab, setTab] = useState<ObjectTab>("info");
  const active = registrations.filter((r) => r.status === "active");
  const pending = registrations.filter((r) => r.status === "pending");

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="sticky top-0 z-20 bg-surface border-b border-line">
        <div className="wrap py-3.5 flex items-center gap-4 flex-wrap">
          <Link
            href="/admin?tab=users"
            className="inline-flex items-center gap-1.5 font-extrabold text-ink-2 hover:text-ink text-[.88rem] shrink-0"
          >
            ← Буцах
          </Link>
          <div className="min-w-0 border-l border-line pl-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[.72rem] font-extrabold px-2 py-0.5 rounded-full ${
                  user.role === "teacher" ? "text-gold-strong bg-gold-soft" : "text-blue-strong bg-blue-soft"
                }`}
              >
                {user.role === "teacher" ? "Багш" : "Сурагч"}
              </span>
            </div>
            <b className="block text-[1.02rem] truncate max-w-[360px]">
              {user.lastName} {user.firstName}
            </b>
          </div>
        </div>

        <div className="wrap flex gap-1 overflow-x-auto">
          <AnchorTab label="Ерөнхий мэдээлэл" active={tab === "info"} onClick={() => setTab("info")} />
          <AnchorTab
            label={`Төхөөрөмж${loginLogs.length ? ` (${loginLogs.length})` : ""}`}
            active={tab === "devices"}
            onClick={() => setTab("devices")}
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
                <InfoRow label="Бүртгүүлсэн огноо" value={new Date(user.createdAt).toLocaleDateString("mn-MN")} />
              </div>
            </Card>

            <Card title={`Сургалт, төлбөрийн түүх (${registrations.length})`}>
              {registrations.length === 0 ? (
                <p className="text-ink-3 font-semibold text-[.9rem]">Бүртгэл алга байна.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {[...active, ...pending]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((r) => (
                      <div
                        key={r.id}
                        className="bg-bg-soft rounded-md px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap"
                      >
                        <div>
                          <b className="font-extrabold block text-[.92rem]">{r.programLabel}</b>
                          <span className="text-ink-3 font-semibold text-[.82rem]">
                            {r.price} · {payMethodLabel(r.payMethod)} ·{" "}
                            {new Date(r.createdAt).toLocaleDateString("mn-MN")}
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
      </div>
    </div>
  );
}
