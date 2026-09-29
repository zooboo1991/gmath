"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IconCheckCircle, IconClose } from "@/components/icons";
import { apiError, readJson } from "@/lib/fetchJson";
import { MEETING_MINUTES } from "@/lib/parentMeeting";

/**
 * «Багштай уулзах цаг» — 1 жилийн хөтөлбөрийн сурагчийн профайл дээр.
 *
 * Эрхгүй хүнд огт харагдахгүй (сервер `eligible: false` буцаана), нээлттэй
 * өдөр байхгүй бол ч харагдахгүй — хоосон карт нь эцэг эхэд "юу ч хийж
 * чадахгүй" гэсэн мэдрэмж төрүүлнэ.
 */

type Day = { date: string; label: string; slots: string[]; full: boolean };
type Mode = "in_person" | "online";
type Meeting = {
  id: string;
  meetingDate: string;
  label: string;
  slot: string;
  mode: Mode;
};
/** Шалгалтаа өгөөгүй бол сервер цаг биш, чиглүүлэх мэдээлэл өгнө. */
type ExamGate = { state: "none" | "started"; href: string; hasOpenDays: boolean };

export default function ParentMeetingCard() {
  const [days, setDays] = useState<Day[]>([]);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [eligible, setEligible] = useState(false);
  const [exam, setExam] = useState<ExamGate | null>(null);
  const [onlineAvailable, setOnlineAvailable] = useState(false);
  const [mode, setMode] = useState<Mode>("in_person");
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/parent-meeting");
    const json = await res.json();
    if (!json?.ok) return;
    setEligible(Boolean(json.eligible));
    setDays(json.days ?? []);
    setMeeting(json.meeting ?? null);
    setOnlineAvailable(Boolean(json.onlineAvailable));
    setExam(
      json.examRequired
        ? { state: json.examState, href: json.examHref, hasOpenDays: Boolean(json.hasOpenDays) }
        : null
    );
  }, []);

  // "Zoom-оор орох" амжилтгүй бол сервер ?meeting=zoom-error-оор буцаана —
  // хүн чимээгүй профайл руу буцчихаад юу болсныг мэдэхгүй үлдэх ёсгүй.
  // ProfileClient-ийн ?course=, ?tab=-тэй адил: useSearchParams биш effect-ээр
  // уншина (хуудсанд Suspense шаардахгүй), нэг tick хойшлуулна (гидрацийн
  // дундуур дахин рендер хийхгүй).
  const [zoomError, setZoomError] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("meeting") !== "zoom-error") return;
    const timer = setTimeout(
      () => setZoomError("Zoom-д холбогдоход алдаа гарлаа. Хэсэг хугацааны дараа дахин дарна уу."),
      0
    );
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await refresh();
      } catch {
        // Цагаа харуулж чадахгүй байх нь профайлыг унагах шалтгаан биш.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const book = async (date: string, slot: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parent-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Онлайн сонголт харагдахгүй байхад (холбоос тохируулаагүй) үргэлж танхим.
        body: JSON.stringify({ date, slot, mode: onlineAvailable ? mode : "in_person" }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setError(apiError(res, json, "Захиалж чадсангүй. Дахин оролдоно уу."));
        // Цагийг нь өөр хүн авсан бол жагсаалтаа шинэчилнэ — хуучин
        // жагсаалт дээр дахин дарахад ижил алдаа давтагдана.
        await refresh().catch(() => {});
        return;
      }
      setMeeting((json as { meeting: Meeting }).meeting);
      setOpen(false);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!meeting) return;
    if (!confirm("Захиалсан цагаа болих уу?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parent-meeting", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: meeting.id }),
      });
      if (!res.ok) {
        const json = await readJson(res);
        setError(apiError(res, json, "Болиулж чадсангүй"));
        return;
      }
      setMeeting(null);
      await refresh().catch(() => {});
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded || !eligible) return null;

  // Шалгалтаа өгөөгүй: цаг биш, шалгалт руу чиглүүлнэ. Уулзалтын ээлж
  // явагдаагүй (нээлттэй өдөргүй) үед энэ сануулгыг ч гаргахгүй.
  if (exam) {
    if (!exam.hasOpenDays) return null;
    const started = exam.state === "started";
    return (
      <div className="bg-gold-soft border border-gold/30 rounded-lg px-[22px] py-[20px]">
        <h3 className="text-[1.05rem] font-extrabold">Багштай уулзах</h3>
        <p className="text-ink-2 font-medium text-[.9rem] mt-2 leading-[1.6]">
          {started
            ? "Уулзалт дээр түвшин тогтоох шалгалтын дүнгээ багштай ярилцана. Эхлүүлсэн шалгалтаа дуусгаж, бодолтоо илгээсний дараа цаг сонгох боломжтой болно."
            : "Уулзалт дээр түвшин тогтоох шалгалтын дүнгээ багштай ярилцана. Эхлээд шалгалтаа өгнө үү — бодолтоо илгээсний дараа цаг сонгох боломжтой болно."}
        </p>
        <Link
          href={exam.href}
          className="inline-flex items-center justify-center gap-2 font-extrabold text-[.9rem] rounded-full bg-gold text-gold-ink shadow-gold px-[22px] py-[11px] mt-3.5 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
        >
          {started ? "Шалгалтаа үргэлжлүүлэх →" : "Түвшин тогтоох шалгалт өгөх →"}
        </Link>
      </div>
    );
  }

  // Захиалсан цаггүй ба нээлттэй өдөр ч алга бол харуулах зүйл байхгүй.
  if (!meeting && days.length === 0) return null;

  const openDays = days.filter((one) => !one.full);
  const picked = days.find((one) => one.date === pickedDate);

  return (
    <div className="bg-surface border border-line rounded-lg shadow-xs px-[22px] py-[20px]">
      <h3 className="text-[1.05rem] font-extrabold">Багштай уулзах</h3>

      {meeting ? (
        <>
          <p className="flex items-center gap-2 font-extrabold text-[.98rem] text-ink mt-3">
            <IconCheckCircle className="w-[18px] h-[18px] text-green shrink-0" />
            {meeting.label} · {meeting.slot}
          </p>
          {meeting.mode === "online" ? (
            <>
              <p className="text-ink-3 font-semibold text-[.85rem] mt-1.5 leading-[1.6]">
                Онлайн уулзалт. Товлосон цагтаа Zoom-оор орно уу — багш таныг хүлээлгийн өрөөнөөс
                оруулна. Уулзалт {MEETING_MINUTES} минут.
              </p>
              {/* Хичээлийн "Хичээлд орох"-той адил: сервер дарах үед бүртгээд
                  хувийн холбоос руу шилжүүлнэ. Холбоос энэ хуудсанд байхгүй. */}
              <a
                href="/api/parent-meeting/join"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 font-extrabold text-[.9rem] rounded-full bg-blue text-white px-[20px] py-[10px] mt-3 hover:bg-blue-strong"
              >
                Zoom-оор орох →
              </a>
            </>
          ) : (
            <p className="text-ink-3 font-semibold text-[.85rem] mt-1.5 leading-[1.6]">
              Товлосон цагтаа төв дээр ирээрэй. Уулзалт {MEETING_MINUTES} минут үргэлжилнэ.
            </p>
          )}
          {(error ?? zoomError) && (
            <p className="text-red-soft font-bold text-[.85rem] mt-2">{error ?? zoomError}</p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={cancel}
            className="block text-[.85rem] font-extrabold text-blue-strong hover:underline mt-2.5 disabled:opacity-50"
          >
            Цагаа болих
          </button>
        </>
      ) : (
        <>
          <p className="text-ink-2 font-medium text-[.9rem] mt-2 leading-[1.6]">
            Хүүхдийнхээ сурлагын талаар багштай ганцаарчлан ярилцах {MEETING_MINUTES} минутын цаг
            сонгоно уу.
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPickedDate(null);
              setOpen(true);
            }}
            className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full border-2 border-blue text-blue-strong px-[22px] py-[11px] text-[.92rem] mt-3.5 transition-colors hover:bg-blue-soft"
          >
            Цаг сонгох
          </button>
        </>
      )}

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

            <h3 className="text-[1.25rem] font-extrabold text-ink pr-8">Багштай уулзах цаг</h3>
            <p className="text-ink-2 font-medium text-[.92rem] mt-2 leading-[1.65]">
              Нэг цагт нэг гэр бүл ордог тул сонгосон цаг тань бусдад харагдахаа болино.
            </p>

            {onlineAvailable && (
              <div className="grid grid-cols-2 gap-2 mt-4" role="radiogroup" aria-label="Уулзалтын хэлбэр">
                {(
                  [
                    ["in_person", "Танхимаар", "Төв дээр ирнэ"],
                    ["online", "Онлайнаар", "Zoom-оор орно"],
                  ] as const
                ).map(([value, title, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => setMode(value)}
                    className={`rounded-md border-[1.5px] px-4 py-2.5 text-left transition-colors ${
                      mode === value ? "border-blue bg-blue-soft" : "border-line-2"
                    }`}
                  >
                    <b className="block text-[.92rem] font-extrabold">{title}</b>
                    <small className="block text-ink-3 font-semibold text-[.8rem]">{hint}</small>
                  </button>
                ))}
              </div>
            )}

            {openDays.length === 0 ? (
              <p className="text-ink-3 font-semibold text-[.9rem] mt-5">
                Одоогоор сул цаг алга байна.
              </p>
            ) : picked === undefined ? (
              <>
                <p className="text-[.8rem] font-extrabold text-ink-3 uppercase tracking-wide mt-5 mb-2">
                  Өдрөө сонгоно уу
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {openDays.map((one) => (
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
                    {picked.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {picked.slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      disabled={busy}
                      onClick={() => book(picked.date, slot)}
                      className="h-11 rounded-md border border-line font-extrabold text-[.88rem] text-ink tabular-nums hover:border-blue hover:bg-blue-soft disabled:opacity-50"
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </>
            )}

            {error && <p className="text-red-soft font-bold text-[.88rem] mt-3">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
