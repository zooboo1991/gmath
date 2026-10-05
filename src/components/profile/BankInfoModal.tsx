"use client";

import Link from "next/link";
import { IconClose } from "@/components/icons";
import BankDetails from "@/components/profile/BankDetails";
import { formatMnt } from "@/lib/price";

/**
 * Account details for a course the student still owes on, opened straight from
 * the profile card — the only other route was the course page's "Үлдэгдэл
 * төлөх" → "Дансаар", two screens deep. Display only: nothing is recorded here;
 * the admin matches the transfer by its description, like any bank payment.
 */
export default function BankInfoModal({
  programId,
  programLabel,
  balance,
  transferNote,
  onClose,
}: {
  programId: string;
  programLabel: string;
  balance: number;
  transferNote: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bank-info-title"
      className="fixed inset-0 z-[100] bg-navy-deep/55 grid place-items-center px-4 py-8 overflow-y-auto"
    >
      <div className="bg-surface rounded-lg shadow-lg w-full max-w-[460px] px-6 py-6 relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Хаах"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg-soft grid place-items-center"
        >
          <IconClose className="w-4 h-4 text-ink-3" />
        </button>

        <h3 id="bank-info-title" className="text-[1.25rem] font-extrabold pr-10">
          Дансны мэдээлэл
        </h3>
        <p className="text-ink-2 font-medium text-[.9rem] mt-1.5 leading-[1.6]">
          {`${programLabel} — үлдэгдэл ${formatMnt(balance)}. Гүйлгээний утгыг яг хэвээр нь бичнэ үү — утга зөрвөл төлбөрийг тань таних боломжгүй болно.`}
        </p>
        <BankDetails amountLabel="Үлдэгдэл" amount={formatMnt(balance)} transferNote={transferNote} />
        <Link
          href={`/profile/course/${encodeURIComponent(programId)}?tab=payment`}
          className="block text-center font-extrabold text-[.9rem] text-blue-strong mt-4"
        >
          QPay-ээр төлөх →
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-12 rounded-full bg-blue text-white font-extrabold shadow-blue mt-3"
        >
          Ойлголоо
        </button>
      </div>
    </div>
  );
}
