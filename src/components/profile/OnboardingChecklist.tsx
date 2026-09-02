"use client";

import Link from "next/link";
import { useState } from "react";
import { IconCheck, IconFacebook, IconCalendar, IconVideoCamera } from "@/components/icons";
import type { RegistrationWithGroup } from "@/lib/db";
import { ONBOARDING_STEPS, type OnboardingState, type OnboardingStep } from "@/lib/onboarding";

/**
 * Төлбөрөө баталгаажуулсан шинэ сурагчийн эхний гурван алхам.
 *
 * Чатаар хамгийн олон ирдэг асуулт нь "одоо хаанаас эхлэх вэ" — хариулт нь
 * үргэлж ижил гурван зүйл байдаг тул тэдгээрийг таамаглах биш, шууд харуулж
 * байна. Сурагч алхам бүрийг өөрөө дарж тэмдэглэнэ; гурвуулаа дуусмагц карт
 * алга болно.
 *
 * Сургалт бүрд давтахгүй, нэг л удаа харагдана: жилийн хөтөлбөр + сонгонтой
 * сурагчид гурван ижил карт харах нь тус болохгүй.
 */

const STEP_LABELS: Record<OnboardingStep, { title: string; hint: string; action: string }> = {
  facebook: {
    title: "Facebook группт нэгдэх",
    hint: "Хичээлийн зар, даалгавар, багшийн мэдэгдэл бүгд тэнд очно.",
    action: "Группт нэгдэх",
  },
  schedule: {
    title: "Хичээлийн хуваариа харах",
    hint: "Хичээл хэзээ, онлайн эсвэл танхимд болохыг урьдчилж мэдэж аваарай.",
    action: "Хуваарь харах",
  },
  zoom: {
    title: "Zoom-оо урьдчилж турших",
    hint: "Дуу, камераа эхний хичээлээс өмнө шалгасан бол хичээл эхлэхэд яарахгүй.",
    action: "Zoom турших",
  },
};

/** Zoom-ийн албан ёсны туршилтын өрөө — дуу, камераа шалгах хамгийн энгийн зам. */
const ZOOM_TEST_URL = "https://zoom.us/test";

export default function OnboardingChecklist({
  registration,
  initial,
  otherActiveCount,
}: {
  registration: RegistrationWithGroup;
  initial: OnboardingState;
  /** Энэ сурагчийн бусад идэвхтэй сургалтын тоо — 0 бол нэмэлт мөр гарахгүй. */
  otherActiveCount: number;
}) {
  const [state, setState] = useState<OnboardingState>(initial);
  const [busy, setBusy] = useState<OnboardingStep | null>(null);

  // Facebook групп ороогүй сургалт дээр тэр алхмыг тэмдэглэх боломжгүй тул
  // дуусгах шалгуураас хасна — эс бөгөөс карт хэзээ ч алга болохгүй.
  const available = ONBOARDING_STEPS.filter((step) => step !== "facebook" || registration.facebookGroup);
  const doneCount = available.filter((step) => state[step]).length;

  const toggle = async (step: OnboardingStep) => {
    const next = !state[step];
    setBusy(step);
    // Шууд тэмдэглээд, алдаа гарвал буцаана — товч дарахад юу ч болохгүй
    // байх нь хамгийн эвгүй.
    setState((s) => ({ ...s, [step]: next }));
    try {
      const res = await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: registration.programId, step, done: next }),
      });
      if (!res.ok) setState((s) => ({ ...s, [step]: !next }));
    } catch {
      setState((s) => ({ ...s, [step]: !next }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-surface border border-blue-soft-2 rounded-md shadow-xs px-5 py-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <b className="block font-extrabold text-[1.05rem]">Эхлэхэд туслах гурван алхам</b>
          <span className="block text-[.85rem] font-semibold text-ink-3 mt-0.5">
            {registration.programLabel}
          </span>
        </div>
        <span className="shrink-0 inline-flex items-center text-[.78rem] font-extrabold text-blue-strong bg-blue-soft px-3 py-1.5 rounded-full">
          {`${doneCount}/${available.length} хийсэн`}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-line mt-3">
        {ONBOARDING_STEPS.map((step) => {
          const labels = STEP_LABELS[step];
          const done = Boolean(state[step]);
          const missingGroup = step === "facebook" && !registration.facebookGroup;

          return (
            <div key={step} className="flex items-start gap-3 py-3">
              <button
                type="button"
                onClick={() => toggle(step)}
                disabled={busy === step || missingGroup}
                aria-pressed={done}
                aria-label={`${labels.title} — ${done ? "хийсэн" : "хийгээгүй"}`}
                className={`shrink-0 w-6 h-6 mt-0.5 rounded-full grid place-items-center transition-colors disabled:opacity-40 ${
                  done ? "bg-green text-white" : "bg-surface border-2 border-line-2 hover:border-blue"
                }`}
              >
                {done && <IconCheck className="w-3.5 h-3.5" strokeWidth={3} />}
              </button>

              <div className="min-w-0 flex-1">
                <span
                  className={`block font-bold text-[.92rem] ${done ? "text-ink-3 line-through" : "text-ink"}`}
                >
                  {labels.title}
                </span>
                <span className="block text-[.8rem] font-semibold text-ink-3 mt-0.5 leading-[1.55]">
                  {missingGroup
                    ? "Facebook групп тун удахгүй — багш бэлэн болмогц энд гарч ирнэ."
                    : labels.hint}
                </span>
              </div>

              {!missingGroup && <StepAction step={step} registration={registration} label={labels.action} />}
            </div>
          );
        })}
      </div>

      {otherActiveCount > 0 && (
        <p className="text-[.8rem] font-semibold text-ink-3 mt-3 pt-3 border-t border-line leading-[1.55]">
          {`Бусад ${otherActiveCount} сургалтынхаа группийн холбоос, хуваарийг тухайн сургалтынхаа хуудаснаас харна уу.`}
        </p>
      )}
    </div>
  );
}

/** Алхам бүрийн үйлдэл: гадаад холбоос эсвэл сургалтын хуудас. */
function StepAction({
  step,
  registration,
  label,
}: {
  step: OnboardingStep;
  registration: RegistrationWithGroup;
  label: string;
}) {
  const className =
    "shrink-0 inline-flex items-center gap-1.5 font-extrabold text-[.82rem] text-blue-strong bg-blue-soft rounded-full px-3.5 py-2";

  if (step === "schedule") {
    return (
      <Link href={`/profile/course/${encodeURIComponent(registration.programId)}`} className={className}>
        <IconCalendar className="w-3.5 h-3.5" /> {label}
      </Link>
    );
  }

  const href = step === "facebook" ? registration.facebookGroup! : ZOOM_TEST_URL;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {step === "facebook" ? (
        <IconFacebook className="w-3.5 h-3.5" />
      ) : (
        <IconVideoCamera className="w-3.5 h-3.5" />
      )}{" "}
      {label}
    </a>
  );
}
