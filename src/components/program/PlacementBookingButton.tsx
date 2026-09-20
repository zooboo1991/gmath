"use client";

import { useCallback, useEffect, useState } from "react";
import { useProgramRegister } from "./ProgramRegister";
import { IconCheckCircle, IconClose } from "@/components/icons";
import type { BookableDay } from "@/lib/placementBooking";
import { formatMnt } from "@/lib/price";

/**
 * «Түвшин тогтоолгох» — танхимд ирж уулзах цаг захиалах.
 *
 * Сургалтад бүртгүүлэхээс ЗОРИУД тусдаа: төлбөр ч алга, суудал ч
 * баталгаажихгүй. Ирж уулзаад аль ангид тохирохоо багштай ярилцана.
 *
 * Сонгож болох өдөр, цагийг сервер өгнө — ангиудын хуваариас гардаг тул
 * багш хуваариа өөрчлөхөд цаг нь өөрөө дагана.
 */

type Booking = {
  id: string;
  bookedDate: string;
  slot: string;
  /** Төлөх ёстой дүн, төгрөгөөр. */
  feeAmount: number;
  paid: boolean;
  qrImage?: string;
  shortUrl?: string;
};

export default function PlacementBookingButton({ className }: { className: string }) {
  const { sessionUser, sessionLoaded, openLogin } = useProgramRegister();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<BookableDay[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState(0);

  const refresh = useCallback(async (): Promise<Booking | null> => {
    const res = await fetch("/api/placement-booking");
    const json = await res.json();
    if (!json?.ok) return null;
    setDays(json.days ?? []);
    setFee(json.fee ?? 0);
    const next = (json.booking ?? null) as Booking | null;
    setBooking(next);
    return next;
  }, []);

  // Цагийн жагсаалт нэвтрээгүй хүнд ч хэрэгтэй: юу сонгож болохыг харуулахын
  // өмнө нэвтрүүл гэж шаардвал хүн цааш явахаа болино.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await refresh();
      } catch {
        // Цагаа харуулж чадахгүй байх нь товчийг нуух шалтгаан биш.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUser, refresh]);

  /**
   * QR харагдаж байхад төлбөрийг өөрсдөө асууна.
   *
   * QPay-ийн webhook маань сервер рүү ирдэг ч эцэг эхийн дэлгэц түүнийг
   * мэдэхгүй. Асуулгүй бол хүн төлчихөөд хуудсаа дахин ачаалах хүртэл
   * "төлөгдөөгүй" гэж харагдана.
   */
  useEffect(() => {
    if (!open || !booking || booking.paid || !booking.qrImage) return;
    const timer = setInterval(() => {
      refresh()
        .then((next) => {
          if (next?.paid) setOpen(false);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [open, booking, refresh]);

  const start = () => {
    setError(null);
    setPickedDate(null);
    setOpen(true);
  };

  const book = async (date: string, slot: string) => {
    if (!sessionUser) {
      openLogin();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/placement-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, slot }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Захиалж чадсангүй. Дахин оролдоно уу.");
        return;
      }
      setBooking(json.booking);
      // Төлөгдсөн бол (stub орчин) шууд хаана; үгүй бол QR энэ цонхонд гарна.
      if (json.booking?.paid) setOpen(false);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!booking) return;
    if (!confirm("Захиалсан цагаа болих уу?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/placement-booking", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: booking.id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error ?? "Болиулж чадсангүй");
        return;
      }
      setBooking(null);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  /** Мөр үүссэн ч мөнгө ороогүй — QR нь хүлээж байна. */
  const awaitingPayment = Boolean(booking && !booking.paid);

  // Төлөгдсөн цагтай бол товчны оронд захиалгаа харуулна.
  if (loaded && sessionLoaded && booking?.paid) {
    return (
      <div className="bg-surface border border-line rounded-md px-5 py-4 max-w-[420px]">
        <p className="flex items-center gap-2 font-extrabold text-[.95rem] text-ink">
          <IconCheckCircle className="w-[18px] h-[18px] text-green shrink-0" />
          Түвшин тогтоох цаг захиалсан
        </p>
        <p className="text-ink-2 font-bold text-[1.02rem] mt-1.5 tabular-nums">
          {booking.bookedDate.slice(5).replace("-", ".")} · {booking.slot}
        </p>
        <p className="text-ink-3 font-semibold text-[.84rem] mt-1.5 leading-[1.6]">
          Төв дээр ирж уулзана. Хүүхдээ дагуулж ирээрэй.
        </p>
        <p className="text-green font-bold text-[.84rem] mt-1.5 leading-[1.6]">
          Төлсөн {formatMnt(booking.feeAmount)} нь сонгоны ангид бүртгүүлэхэд эхний төлөлтөөс
          хасагдана.
        </p>
        {error && <p className="text-red-soft font-bold text-[.85rem] mt-2">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={cancel}
          className="text-[.84rem] font-extrabold text-blue-strong hover:underline mt-2.5 disabled:opacity-50"
        >
          Цагаа болих
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={start} className={className}>
        {awaitingPayment ? "Төлбөрөө төлөх" : "Түвшин тогтоолгох"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-navy-deep/55 grid place-items-center px-4 py-8 overflow-y-auto">
          <div className="bg-surface rounded-lg shadow-lg w-full max-w-[560px] px-6 py-6 relative text-left">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Хаах"
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg-soft grid place-items-center"
            >
              <IconClose className="w-4 h-4 text-ink-3" />
            </button>

            <h3 className="text-[1.25rem] font-extrabold text-ink pr-8">Түвшин тогтоолгох</h3>
            <p className="text-ink-2 font-medium text-[.92rem] mt-2 leading-[1.65]">
              Танхимд ирж түвшин тогтоолгож, аль ангид орохоо багштай ярилцана. Цаг захиалахад{" "}
              <b className="text-ink">{formatMnt(booking?.feeAmount ?? fee)}</b> төлнө — тэр мөнгө
              нь сонгоны ангид бүртгүүлэхэд эхний төлөлтөөс хасагдана. Энэ нь сургалтад
              бүртгүүлсэн гэсэн үг биш, суудал баталгаажихгүй.
            </p>

            {awaitingPayment && booking ? (
              <div className="mt-5 text-center">
                <p className="text-[.9rem] font-extrabold text-ink">
                  {booking.bookedDate.slice(5).replace("-", ".")} · {booking.slot}
                </p>
                <p className="text-[.86rem] font-semibold text-ink-2 mt-1">
                  Төлөх дүн <b className="text-ink">{formatMnt(booking.feeAmount)}</b>
                </p>
                {booking.qrImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/png;base64,${booking.qrImage}`}
                      alt="QPay QR код"
                      className="w-[210px] h-[210px] mx-auto rounded-sm border border-line mt-3"
                    />
                    {/* Эцэг эх QR-ыг нээгээд банкны аппаараа гараар шилжүүлдэг
                        тохиолдол бодитоор гарсан — тийм гүйлгээг QPay мэдэхгүй. */}
                    <p className="text-[.8rem] font-semibold text-ink-3 mt-3 leading-[1.6]">
                      Гараар хийсэн дансны гүйлгээ энэ QR-т холбогдохгүй. Төлөгдмөгц энэ цонх
                      өөрөө хаагдана.
                    </p>
                    {booking.shortUrl && (
                      <a
                        href={booking.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-2 text-[.88rem] font-bold text-blue-strong"
                      >
                        Эсвэл богино холбоосоор нээх →
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-ink-3 font-semibold text-[.9rem] mt-4">QR-ыг уншиж байна…</p>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancel}
                  className="block mx-auto text-[.84rem] font-extrabold text-ink-3 hover:text-ink mt-4 disabled:opacity-50"
                >
                  Захиалгаа цуцлах
                </button>
              </div>
            ) : days.length === 0 ? (
              <p className="text-ink-3 font-semibold text-[.9rem] mt-5">
                {loaded ? "Одоогоор сул цаг алга байна." : "Цагийг уншиж байна…"}
              </p>
            ) : pickedDate === null ? (
              <>
                <p className="text-[.8rem] font-extrabold text-ink-3 uppercase tracking-wide mt-5 mb-2">
                  Өдрөө сонгоно уу
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {days.map((one) => (
                    <button
                      key={one.date}
                      type="button"
                      onClick={() => setPickedDate(one.date)}
                      className="h-11 rounded-md border border-line font-extrabold text-[.88rem] text-ink-2 hover:border-blue-soft-2 hover:text-blue-strong"
                    >
                      {one.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mt-5 mb-2">
                  <button
                    type="button"
                    onClick={() => setPickedDate(null)}
                    className="text-[.82rem] font-extrabold text-blue-strong hover:underline"
                  >
                    ← Өдөр солих
                  </button>
                  <span className="text-[.8rem] font-extrabold text-ink-3 uppercase tracking-wide ml-auto">
                    {days.find((one) => one.date === pickedDate)?.label}
                  </span>
                </div>
                {/* Цагууд нь ангиудын хуваариас гардгийг хэлж өгнө — эс бөгөөс
                    баасан гараг шиг өдөр "ажлын цаг бүхэлдээ" мэт харагдана. */}
                <p className="text-ink-3 font-semibold text-[.8rem] mb-2">
                  Хичээл орж байгаа цагуудаас сонгоно
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(days.find((one) => one.date === pickedDate)?.slots ?? []).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      disabled={busy}
                      onClick={() => book(pickedDate, slot)}
                      className="h-11 rounded-md border border-line font-extrabold text-[.88rem] text-ink tabular-nums hover:border-blue hover:bg-blue-soft disabled:opacity-50"
                    >
                      {slot}
                    </button>
                  ))}
                </div>
                {!sessionUser && sessionLoaded && (
                  <p className="text-ink-3 font-semibold text-[.84rem] mt-3">
                    Цаг сонгоход нэвтрэх шаардлагатай — хэн ирэхийг нь мэдэхгүй бол багш
                    хүлээж чадахгүй.
                  </p>
                )}
              </>
            )}

            {error && <p className="text-red-soft font-bold text-[.88rem] mt-3">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
