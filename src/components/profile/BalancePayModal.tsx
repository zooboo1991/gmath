"use client";

import { useEffect, useState } from "react";
import { IconClose, IconBank, IconQrCode, IconCheckCircle, IconCopy, IconCheck } from "@/components/icons";
import { BANK_ACCOUNT, BANK_NAME, BANK_RECIPIENT } from "@/lib/bankAccount";
import { formatMnt } from "@/lib/price";

/** Хамгийн бага төлөлт — серверийн шалгалттай ижил. */
const MIN_AMOUNT = 50_000;
const POLL_MS = 4000;
const MAX_POLLS = 45;

type Intent = { id: string; amount: number; qpayQrImage?: string; qpayShortUrl?: string };

/**
 * Үлдэгдлээ төлөх цонх: дүнгээ оруулаад QPay эсвэл дансаар.
 *
 * Дүнг сервер дахин шалгадаг тул энд хийж байгаа шалгалт нь зөвхөн хэрэглэгчид
 * шууд хэлэх зорилготой — сервер л эцсийн үг.
 */
export default function BalancePayModal({
  registrationId,
  balance,
  transferNote,
  onClose,
  onPaid,
}: {
  registrationId: string;
  balance: number;
  /** Гүйлгээний утга — бүртгүүлэхэд ашигласантай ижил. */
  transferNote: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState(String(balance));
  const [step, setStep] = useState<"amount" | "qpay" | "bank" | "done">("amount");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const digits = Number(amount.replace(/[^\d]/g, "")) || 0;

  const start = async (method: "qpay" | "bank") => {
    if (digits < MIN_AMOUNT) {
      setError(`Хамгийн багадаа ${formatMnt(MIN_AMOUNT)} төлнө`);
      return;
    }
    if (digits > balance) {
      setError(`Үлдэгдлээс их дүн төлөх боломжгүй (үлдэгдэл ${formatMnt(balance)})`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/enroll/${registrationId}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: digits, method }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Төлбөр эхлүүлэхэд алдаа гарлаа");
        return;
      }
      if (json.paid) {
        setStep("done");
        onPaid();
        return;
      }
      setIntent(json.intent ?? null);
      setStep(method);
    } catch {
      setError("Сүлжээний алдаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  // QPay-ийн QR гарсан үед төлөгдсөн эсэхийг тодорхой давтамжтай шалгана.
  // Cron биш клиентээс: QPay таймераар шалгахыг хориглодог.
  useEffect(() => {
    if (step !== "qpay" || !intent) return;
    let tries = 0;
    let stopped = false;
    const timer = setInterval(async () => {
      tries += 1;
      if (tries > MAX_POLLS || stopped) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch(`/api/enroll/${registrationId}/balance/${intent.id}/check`, {
          method: "POST",
        });
        const json = await res.json();
        if (json.paid) {
          stopped = true;
          clearInterval(timer);
          setStep("done");
          onPaid();
        }
      } catch {
        // Сүлжээ тасарсан ч дараагийн оролдлого үргэлжилнэ.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [step, intent, registrationId, onPaid]);

  const copy = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-navy-deep/55 grid place-items-center px-4 py-8 overflow-y-auto">
      <div className="bg-surface rounded-lg shadow-lg w-full max-w-[460px] px-6 py-6 relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Хаах"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg-soft grid place-items-center"
        >
          <IconClose className="w-4 h-4 text-ink-3" />
        </button>

        {step === "amount" && (
          <>
            <h3 className="text-[1.25rem] font-extrabold">Үлдэгдэл төлөх</h3>
            <p className="text-ink-2 font-medium text-[.9rem] mt-1.5 leading-[1.6]">
              {`Төлөх үлдэгдэл ${formatMnt(balance)}. Хэсэгчлэн төлж болно — хамгийн багадаа ${formatMnt(MIN_AMOUNT)}.`}
            </p>
            <label className="block mt-4">
              <span className="block text-[.78rem] font-extrabold text-ink-3 uppercase tracking-[.04em] mb-1.5">
                Төлөх дүн
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                className="h-12 w-full rounded-md border border-line px-3.5 font-extrabold text-[1.05rem] bg-surface"
              />
            </label>
            {error && <p className="text-red-soft font-bold text-[.85rem] mt-2">{error}</p>}
            <div className="flex flex-col gap-2.5 mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => start("qpay")}
                className="flex items-center justify-center gap-2 h-12 rounded-full bg-blue text-white font-extrabold shadow-blue disabled:opacity-50"
              >
                <IconQrCode className="w-4 h-4" /> {busy ? "Түр хүлээнэ үү…" : "QPay-ээр төлөх"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => start("bank")}
                className="flex items-center justify-center gap-2 h-12 rounded-full bg-bg-soft text-ink-2 font-extrabold disabled:opacity-50"
              >
                <IconBank className="w-4 h-4" /> Дансаар шилжүүлэх
              </button>
            </div>
          </>
        )}

        {step === "qpay" && intent && (
          <>
            <h3 className="text-[1.25rem] font-extrabold">QPay-ээр төлөх</h3>
            <p className="text-ink-2 font-medium text-[.9rem] mt-1.5">
              {`${formatMnt(intent.amount)} — банкны аппаараа уншуулна уу.`}
            </p>
            {intent.qpayQrImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${intent.qpayQrImage}`}
                alt="QPay QR код"
                className="w-[220px] h-[220px] mx-auto mt-4 rounded-md"
              />
            )}
            {intent.qpayShortUrl && (
              <a
                href={intent.qpayShortUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-center font-extrabold text-[.9rem] text-blue-strong mt-3"
              >
                Банкны апп нээх →
              </a>
            )}
            <p className="text-ink-3 font-semibold text-[.82rem] text-center mt-3 leading-[1.6]">
              Төлбөр орсныг систем өөрөө мэдэж, энэ цонх шинэчлэгдэнэ.
            </p>
          </>
        )}

        {step === "bank" && intent && (
          <>
            <h3 className="text-[1.25rem] font-extrabold">Дансаар шилжүүлэх</h3>
            <p className="text-ink-2 font-medium text-[.9rem] mt-1.5 leading-[1.6]">
              Гүйлгээний утгыг яг хэвээр нь бичнэ үү. Ажлын өдрүүдэд 24 цагийн дотор
              баталгаажиж, танд мэдэгдэнэ.
            </p>
            <div className="bg-bg-soft rounded-md px-4 py-3 mt-3.5">
              {[
                ["bank", "Банк", BANK_NAME],
                ["account", "Дансны дугаар", BANK_ACCOUNT],
                ["recipient", "Хүлээн авагч", BANK_RECIPIENT],
                ["amount", "Шилжүүлэх дүн", formatMnt(intent.amount)],
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
            <button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-full bg-blue text-white font-extrabold shadow-blue mt-4"
            >
              Ойлголоо
            </button>
          </>
        )}

        {step === "done" && (
          <div className="text-center py-4">
            <span className="inline-grid place-items-center w-14 h-14 rounded-full bg-green-soft text-green">
              <IconCheckCircle className="w-8 h-8" />
            </span>
            <h3 className="text-[1.25rem] font-extrabold mt-3">Төлбөр амжилттай</h3>
            <p className="text-ink-2 font-medium text-[.9rem] mt-1.5">
              Төлбөр тань бүртгэгдлээ. Баярлалаа!
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-full bg-blue text-white font-extrabold shadow-blue mt-4"
            >
              Хаах
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
