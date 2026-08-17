"use client";

import Link from "next/link";
import { useState } from "react";
import type { PublicUser, Registration } from "@/lib/db";
import { IconCheckCircle, IconClock, IconClose } from "@/components/icons";
import { payMethodLabel, programAdminHref } from "@/lib/registration";
import PendingRegistrationActions from "@/components/admin/PendingRegistrationActions";

type RegistrationWithUser = Registration & { user?: PublicUser };

/** The registrations tab as its own route component — approve/cancel state used to live in the dashboard parent. */
export default function RegistrationsPanel({
  initialRegistrations,
  canEdit,
}: {
  initialRegistrations: RegistrationWithUser[];
  // The read-only admin sees the same list without the two action buttons.
  // Cosmetic only — the approve/cancel endpoints check the role themselves.
  canEdit: boolean;
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [busyId, setBusyId] = useState<string | null>(null);

  const patchRegistration = (id: string, patch: Partial<Registration>) => {
    setRegistrations((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  // For a QPay checkout the student abandoned, or one that simply never got
  // paid — clears it out of the queue instead of leaving it stuck forever,
  // and voids the QPay invoice so a stale QR can't move money later against
  // a registration that no longer exists on our side.
  const cancelRegistration = async (id: string) => {
    if (!confirm("Энэ бүртгэлийг цуцлах уу? QPay-ийн нэхэмжлэл хүчингүй болж, бүртгэл «Цуцалсан» болно.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}/cancel`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        patchRegistration(id, { status: "cancelled" });
      } else if (json.paid) {
        // Lost the race with the student's own payment — reflect reality
        // instead of leaving a stale "pending" row in view.
        setRegistrations((rs) => rs.map((r) => (r.id === id ? { ...r, status: "active" } : r)));
      } else {
        alert(json.error ?? "Цуцлахад алдаа гарлаа");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {registrations.length === 0 && (
        <p className="text-ink-3 font-semibold text-center py-10">Бүртгэл алга байна.</p>
      )}
      {registrations.map((r) => (
        <div
          key={r.id}
          className="bg-surface border border-line rounded-md shadow-xs px-6 py-5 flex items-center justify-between flex-wrap gap-4"
        >
          <div>
            <Link
              href={programAdminHref(r.programId)}
              className="font-extrabold block hover:text-blue-strong hover:underline"
            >
              {r.programLabel}
            </Link>
            <span className="text-ink-3 font-semibold text-[.85rem]">
              {r.user ? (
                <Link href={`/admin/users/${r.user.id}`} className="hover:text-blue-strong hover:underline">
                  {r.user.lastName} {r.user.firstName} · {r.user.phone}
                </Link>
              ) : r.phone ? (
                `Бүртгэл хүлээгдэж буй · ${r.phone}`
              ) : (
                "Хэрэглэгч устсан"
              )}{" "}
              · {payMethodLabel(r.payMethod)} · {r.price}
            </span>
          </div>
          {r.status === "active" ? (
            <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
              <IconCheckCircle className="w-3.5 h-3.5" /> Идэвхтэй
            </span>
          ) : r.status === "cancelled" ? (
            <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-ink-3 bg-bg-soft px-3 py-1.5 rounded-full">
              <IconClose className="w-3.5 h-3.5" /> Цуцалсан
            </span>
          ) : !canEdit ? (
            <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-gold-strong bg-gold-soft px-3 py-1.5 rounded-full">
              <IconClock className="w-3.5 h-3.5" /> Хүлээгдэж буй
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => cancelRegistration(r.id)}
                className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-ink-2 bg-bg-soft px-4 py-2 rounded-full disabled:opacity-50"
              >
                <IconClose className="w-3.5 h-3.5" /> Цуцлах
              </button>
              <PendingRegistrationActions
                registration={r}
                onDone={(patch) => patchRegistration(r.id, patch)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
