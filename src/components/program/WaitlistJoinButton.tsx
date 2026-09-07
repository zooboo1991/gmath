"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useProgramRegister } from "./ProgramRegister";
import { IconCheckCircle, IconClock, IconClose } from "@/components/icons";

/**
 * Бүртгэл хаагдсан хөтөлбөрийн "Хүлээлгийн жагсаалтад бүртгүүлэх" товч.
 *
 * Нэвтрээгүй бол эхлээд нэвтрүүлнэ — жагсаалтын утга нь сул орон гармагц
 * залгах явдал тул хэн болохыг нь мэдэхгүй бол утгагүй. Нэвтэрсний дараа
 * товч нь өөрөө дахин ажиллах шаардлагагүй: хуудас ачаалахад аль хэдийн
 * дараалалд байгаа эсэхийг шалгаад төлөвөө харуулна.
 */
export default function WaitlistJoinButton({
  programId,
  className,
}: {
  programId: string;
  className: string;
}) {
  const router = useRouter();
  const { sessionUser, sessionLoaded, openLogin } = useProgramRegister();
  const [position, setPosition] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Аль хэдийн дараалалд байгаа эсэх — нэвтэрсэн хүнд л асууна.
  useEffect(() => {
    if (!sessionUser) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/programs/${programId}/waitlist`);
        const json = await res.json();
        if (!cancelled && json?.joined) setPosition(json.position ?? null);
      } catch {
        // Байрыг нь мэдэхгүй байх нь товчийг хаах шалтгаан биш.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUser, programId]);

  // Товч дарах нь өөрөө бүртгэл байхаа больсон: санамсаргүй дарж
  // өөрийнхөө сургалтын дараалалд зогссон тохиолдол бодитоор гарсан.
  const start = () => {
    if (!sessionUser) {
      openLogin();
      return;
    }
    setError(null);
    setConfirming(true);
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/waitlist`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Бүртгэж чадсангүй. Дахин оролдоно уу.");
        return;
      }
      // Профайл руу: байр, гарах товч, бусад дараалал бүгд тэнд нэг дор.
      // refresh нь профайлын серверийн өгөгдлийг шинэ мөртэй нь дахин татна.
      router.push("/profile?tab=waitlist");
      router.refresh();
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  if (position !== null) {
    // Хоёр байрлал хоёулаа хар хөх дэвсгэр дээр тул цайвар өнгөөр бичнэ.
    return (
      <div className="bg-white/10 border border-white/25 rounded-lg px-5 py-4 max-w-[440px]">
        <p className="flex items-center gap-2 font-extrabold text-gold text-[1.02rem]">
          <IconCheckCircle className="w-5 h-5 shrink-0" />
          {`Та хүлээлгийн жагсаалтын №${position}-т байна`}
        </p>
        <p className="text-white/85 font-semibold text-[.92rem] mt-1.5 leading-[1.6]">
          Сургалтад сул орон тоо гарвал жагсаалтын дагуу тантай холбогдох болно.
        </p>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={start} disabled={!sessionLoaded} className={className}>
        <IconClock className="w-5 h-5" />
        Хүлээлгийн жагсаалтад бүртгүүлэх
      </button>
      {error && !confirming && <p className="text-gold font-bold text-[.88rem] mt-2">{error}</p>}

      {confirming && (
        <div className="fixed inset-0 z-[100] bg-navy-deep/55 grid place-items-center px-4 py-8 overflow-y-auto">
          <div className="bg-surface rounded-lg shadow-lg w-full max-w-[460px] px-6 py-6 relative text-left">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              aria-label="Хаах"
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg-soft grid place-items-center"
            >
              <IconClose className="w-4 h-4 text-ink-3" />
            </button>

            <h3 className="text-[1.25rem] font-extrabold text-ink">Хүлээлгийн жагсаалтад орох уу?</h3>
            <p className="text-ink-2 font-medium text-[.92rem] mt-2 leading-[1.65]">
              Энэ сургалтын бүртгэл түр хаагдсан байна. Жагсаалтад орсноор сул орон тоо гармагц
              бид дарааллын дагуу тантай холбогдоно.
            </p>
            <p className="text-ink-3 font-semibold text-[.86rem] mt-2.5 leading-[1.6]">
              Энэ нь сургалтад бүртгүүлсэн гэсэн үг биш — төлбөр төлөхгүй, суудал баталгаажихгүй.
            </p>

            {error && <p className="text-red-soft font-bold text-[.88rem] mt-3">{error}</p>}

            <div className="flex items-center gap-2.5 mt-5">
              <button
                type="button"
                disabled={busy}
                onClick={join}
                className="flex-1 h-12 rounded-full bg-navy text-white font-extrabold disabled:opacity-50"
              >
                {busy ? "Бүртгэж байна…" : "Тийм, жагсаалтад орно"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="h-12 px-5 rounded-full border border-line font-extrabold text-ink-2 disabled:opacity-50"
              >
                Болих
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
