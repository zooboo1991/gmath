"use client";

import { useState } from "react";
import { IconCopy, IconCheck } from "@/components/icons";
import { BANK_ACCOUNT, BANK_NAME, BANK_RECIPIENT } from "@/lib/bankAccount";

/**
 * The copyable account box. Shared by the balance-payment window and the
 * profile card's "Дансны мэдээлэл" window so the two always read the same.
 */
export default function BankDetails({
  amountLabel,
  amount,
  transferNote,
}: {
  amountLabel: string;
  /** Already formatted, e.g. "1,400,000₮". */
  amount: string;
  transferNote: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="bg-bg-soft rounded-md px-4 py-3 mt-3.5">
      {[
        ["bank", "Банк", BANK_NAME],
        ["account", "Дансны дугаар", BANK_ACCOUNT],
        ["recipient", "Хүлээн авагч", BANK_RECIPIENT],
        ["amount", amountLabel, amount],
        ["note", "Гүйлгээний утга", transferNote],
      ].map(([key, label, value]) => (
        <div key={key} className="flex flex-col gap-0.5 py-2 border-b border-line last:border-0">
          <span className="text-ink-3 font-semibold text-[.78rem]">{label}</span>
          <span className="flex items-start gap-2">
            <b className="min-w-0 break-words font-bold text-[.92rem]">{value}</b>
            <button
              type="button"
              onClick={() => copy(key, value)}
              aria-label={`${label} хуулах`}
              className="shrink-0 text-ink-3 hover:text-blue-strong"
            >
              {copied === key ? (
                <IconCheck className="w-4 h-4 text-green" strokeWidth={2.8} />
              ) : (
                <IconCopy className="w-4 h-4" />
              )}
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
