"use client";

import { useEffect, useState } from "react";
import { useProgramRegister } from "./ProgramRegister";
import { IconCheckCircle, IconClock } from "@/components/icons";

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
  const { sessionUser, sessionLoaded, openLogin } = useProgramRegister();
  const [position, setPosition] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const join = async () => {
    if (!sessionUser) {
      openLogin();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/waitlist`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Бүртгэж чадсангүй. Дахин оролдоно уу.");
        return;
      }
      setPosition(json.position ?? null);
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
      <button type="button" onClick={join} disabled={busy || !sessionLoaded} className={className}>
        <IconClock className="w-5 h-5" />
        {busy ? "Бүртгэж байна…" : "Хүлээлгийн жагсаалтад бүртгүүлэх"}
      </button>
      {error && <p className="text-gold font-bold text-[.88rem] mt-2">{error}</p>}
    </div>
  );
}
