"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import MathText from "@/components/assessment/MathText";
import FormField from "@/components/FormField";
import { useProgramRegister } from "@/components/program/ProgramRegister";
import { TRACK_LABELS, type Assessment, type AssessmentTrack, type PublicQuizQuestion } from "@/lib/assessment/types";

type Step =
  | "loading"
  | "track"
  | "grade"
  | "payment"
  | "qpay-wait"
  | "questionnaire"
  | "solve"
  | "quiz"
  | "quiz-result"
  | "submitted";

const CARD = "bg-surface border border-line rounded-lg shadow-sm px-[26px] py-[26px]";

export default function AssessmentFlow() {
  const router = useRouter();
  const { sessionUser, sessionLoaded, openLogin } = useProgramRegister();

  const [step, setStep] = useState<Step>("loading");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [fee, setFee] = useState("");
  const [fees, setFees] = useState<{ olympiad: string; quiz: string } | null>(null);
  const [invitedExams, setInvitedExams] = useState<{ id: string; title: string }[]>([]);
  const [examId, setExamId] = useState<string | null>(null);
  // The picker's choices, before an assessment row exists to carry them.
  const [pickedTrack, setPickedTrack] = useState<AssessmentTrack | null>(null);
  const [pickedGrade, setPickedGrade] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qpayQr, setQpayQr] = useState<{ qrImage: string; shortUrl: string } | null>(null);

  const stepForStatus = (a: Assessment | null): Step => {
    if (!a) return "track";
    const isQuiz = a.track === "regular" || a.track === "advanced";
    if (a.status === "awaiting_payment") return "payment";
    // An exam's paper is laid out on payment, so an exam assessment is never
    // waiting on a form — including one that was started before this changed
    // and has been sitting at "paid" ever since.
    if (a.status === "paid") return isQuiz ? "quiz" : a.examId ? "solve" : "questionnaire";
    // The exam's problems were written onto the assessment when the
    // questionnaire was submitted, so there is nothing to pick — the child
    // goes to the page where they solve and upload.
    if (a.status === "questionnaire_done") return "solve";
    if (a.status === "completed" && isQuiz) return "quiz-result";
    return "submitted";
  };

  // Load any assessment already in progress, so a refresh resumes rather
  // than silently starting (and charging for) a second one. Fetching the
  // first problem here — rather than from a second effect watching `step` —
  // keeps every setState inside an async callback instead of an effect body.
  useEffect(() => {
    if (!sessionLoaded || !sessionUser) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/assessment");
        const json = await res.json();
        if (cancelled || !res.ok) return;
        setAssessment(json.assessment);
        setFee(json.fee);
        setFees(json.fees ?? null);
        setInvitedExams(json.invitedExams ?? []);
        // ?exam=<id> comes from the course card the child pressed. With two
        // invitations (both the C and the D programme) it is the only thing
        // that says which one they meant.
        const wanted = new URLSearchParams(window.location.search).get("exam");
        setExamId(
          wanted && (json.invitedExams ?? []).some((e: { id: string }) => e.id === wanted)
            ? wanted
            : ((json.invitedExams ?? [])[0]?.id ?? null)
        );
        const next = stepForStatus(json.assessment);
        setStep(next);
        if (next === "solve" && json.assessment) {
          router.push(`/assessment/${json.assessment.id}/solve`);
        }
      } catch {
        if (!cancelled) setError("Сүлжээний алдаа гарлаа. Хуудсаа шинэчилнэ үү.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionLoaded, sessionUser, router]);

  /**
   * Where an assessment should be after it changed hands. "solve" is a page,
   * not a step in this component: an exam's paper is laid out the moment the
   * fee settles, so the child leaves for the first problem rather than being
   * shown anything else.
   */
  const goTo = useCallback(
    (next: Assessment) => {
      const step = stepForStatus(next);
      if (step === "solve") {
        router.push(`/assessment/${next.id}/solve`);
        return;
      }
      setStep(step);
    },
    [router]
  );

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      // Create-or-resume first, so a double click can't open two assessments.
      const createRes = await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: pickedTrack ?? "olympiad",
          grade: pickedGrade ?? undefined,
          examId: examId ?? undefined,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        setError(created.error ?? "Алдаа гарлаа");
        return;
      }
      const id = created.assessment.id as string;

      const payRes = await fetch(`/api/assessment/${id}/pay`, { method: "POST" });
      const paid = await payRes.json();
      if (!payRes.ok) {
        setError(paid.error ?? "Төлбөр төлөхөд алдаа гарлаа");
        return;
      }
      setAssessment(paid.assessment);
      if (paid.paid) {
        goTo(paid.assessment);
      } else {
        setQpayQr({ qrImage: paid.qrImage, shortUrl: paid.shortUrl });
        setStep("qpay-wait");
      }
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const checkAssessmentPayment = useCallback(async () => {
    if (!assessment) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessment/${assessment.id}/pay/check`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Алдаа гарлаа");
        return false;
      }
      setAssessment(json.assessment);
      if (json.paid) {
        goTo(json.assessment);
        return true;
      }
      return false;
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [assessment, goTo]);

  // Light client-side polling while the QR is on screen, so most students
  // never have to press "Шалгах" themselves. This is not the server-side
  // cron QPay's docs warn against — it's bounded, only runs while this exact
  // screen is open, and stops the moment it is not.
  useEffect(() => {
    if (step !== "qpay-wait" || !assessment) return;
    let cancelled = false;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > 45) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch(`/api/assessment/${assessment.id}/pay/check`, { method: "POST" });
        const json = await res.json();
        if (cancelled || !res.ok) return;
        if (json.paid) {
          clearInterval(timer);
          setAssessment(json.assessment);
          setStep(stepForStatus(json.assessment));
        }
      } catch {
        // Retried on the next tick.
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, assessment]);

  if (!sessionLoaded) {
    return <div className={`${CARD} text-center text-ink-3 font-semibold`}>Ачаалж байна…</div>;
  }

  if (!sessionUser) {
    return (
      <div className={`${CARD} text-center`}>
        <h2 className="text-[1.25rem] font-extrabold">Эхлээд нэвтэрнэ үү</h2>
        <p className="text-ink-2 font-medium mt-2.5">
          Түвшин тогтоох үнэлгээний хариу таны профайлд хадгалагдана. Тиймээс нэвтэрсэн байх
          шаардлагатай.
        </p>
        <button
          type="button"
          onClick={openLogin}
          className="inline-flex items-center justify-center font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
        >
          Нэвтрэх
        </button>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="bg-[oklch(0.97_0.03_25)] text-red-soft font-semibold text-[.9rem] rounded-md px-4 py-3 mb-4">
          {error}
        </p>
      )}

      {step === "loading" && (
        <div className={`${CARD} text-center text-ink-3 font-semibold`}>Ачаалж байна…</div>
      )}

      {/* Invited: their class was named on an exam, so there is exactly one
          thing for them to do here. Showing the three-way picker (and three
          prices) would be asking a question that has already been answered. */}
      {step === "track" && invitedExams.length > 0 && (
        <InvitedStep
          title={(invitedExams.find((e) => e.id === examId) ?? invitedExams[0]).title}
          busy={busy}
          onStart={() => {
            setPickedTrack("olympiad");
            void pay();
          }}
        />
      )}

      {step === "track" && invitedExams.length === 0 && (
        <TrackStep
          fees={fees}
          onPick={(t) => {
            setPickedTrack(t);
            setFee(t === "olympiad" ? fees?.olympiad ?? "" : fees?.quiz ?? "");
            setStep(t === "olympiad" ? "payment" : "grade");
          }}
        />
      )}

      {step === "grade" && (
        <GradeStep
          onBack={() => setStep("track")}
          onPick={(g) => {
            setPickedGrade(g);
            setStep("payment");
          }}
        />
      )}

      {step === "payment" && (
        <PaymentStep
          track={assessment?.track ?? pickedTrack ?? "olympiad"}
          fee={fee}
          busy={busy}
          onPay={pay}
        />
      )}

      {step === "qpay-wait" && qpayQr && (
        <QpayWaitStep
          fee={fee}
          qrImage={qpayQr.qrImage}
          shortUrl={qpayQr.shortUrl}
          busy={busy}
          onCheck={checkAssessmentPayment}
        />
      )}

      {step === "questionnaire" && assessment && (
        <QuestionnaireStep
          assessmentId={assessment.id}
          onDone={(a) => {
            setAssessment(a);
            router.push(`/assessment/${a.id}/solve`);
          }}
        />
      )}

      {step === "solve" && (
        <div className={`${CARD} text-center text-ink-3 font-semibold`}>Шалгалт руу шилжиж байна…</div>
      )}

      {step === "quiz" && assessment && (
        <QuizStep
          assessmentId={assessment.id}
          onDone={(a) => {
            setAssessment(a);
            setStep("quiz-result");
          }}
        />
      )}

      {step === "quiz-result" && assessment && <QuizResultStep assessment={assessment} />}

      {step === "submitted" && <SubmittedStep />}
    </>
  );
}

/**
 * The whole of the flow for a child whose class was invited: the exam's name,
 * that it costs them nothing, and one button into it.
 */
function InvitedStep({
  title,
  busy,
  onStart,
}: {
  title: string;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <div className={`${CARD} text-center`}>
      <span className="inline-flex items-center gap-1.5 text-[.72rem] font-extrabold tracking-[.06em] uppercase text-gold-strong bg-gold-soft px-3 py-1.5 rounded-full">
        Үнэгүй
      </span>
      <h2 className="text-[1.3rem] font-extrabold mt-3.5">{title}</h2>
      <p className="text-ink-2 font-medium mt-2.5 max-w-[48ch] mx-auto leading-[1.7]">
        Багш бодлогуудаа сонгож бэлдсэн. Нэг нэгээр нь харж бодоод, бодолтынхоо зургийг
        хавсаргаарай. Дуусмагц багш шалгаж, түвшнийг тань тогтооно.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onStart}
        className="w-full sm:w-auto font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[30px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50"
      >
        {busy ? "Түр хүлээнэ үү…" : "Шалгалт эхлүүлэх →"}
      </button>
    </div>
  );
}

function TrackStep({
  fees,
  onPick,
}: {
  fees: { olympiad: string; quiz: string } | null;
  onPick: (track: AssessmentTrack) => void;
}) {
  const cards: { track: AssessmentTrack; title: string; text: string; fee: string }[] = [
    {
      track: "regular",
      title: "Энгийн анги",
      text: "Ангийн хөтөлбөрийн хялбар тест. Оноо болон AI зөвлөмж шууд гарна.",
      fee: fees?.quiz ?? "",
    },
    {
      track: "advanced",
      title: "Сонгон анги",
      text: "Сонгон суралцагчдад зориулсан ахисан тест. Оноо болон AI зөвлөмж шууд гарна.",
      fee: fees?.quiz ?? "",
    },
    {
      track: "olympiad",
      title: "Олимпиад",
      text: "Бодолтоо бичгээр илгээж, Ганбат багш шалгаад 1-10 түвшин, хувийн дүгнэлт өгнө.",
      fee: fees?.olympiad ?? "",
    },
  ];
  return (
    <div className={CARD}>
      <h2 className="text-[1.3rem] font-extrabold">Аль төрлөөр түвшнээ тогтоох вэ?</h2>
      <p className="text-ink-2 font-medium mt-2 text-[.95rem]">
        Хүүхдийнхээ одоогийн ангид тохирохыг сонгоорой — эргэлзвэл Энгийнээс эхлэхэд болно.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        {cards.map((c) => (
          <button
            key={c.track}
            type="button"
            onClick={() => onPick(c.track)}
            className="text-left bg-surface-2 border-[1.5px] border-line-2 rounded-md px-4 py-4 hover:border-blue transition-colors flex flex-col gap-2"
          >
            <b className="font-extrabold text-[1.02rem]">{c.title}</b>
            <span className="text-[.85rem] text-ink-2 font-medium leading-[1.55] flex-1">{c.text}</span>
            <span className="text-[.95rem] font-extrabold text-navy">{c.fee || "—"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GradeStep({ onBack, onPick }: { onBack: () => void; onPick: (grade: number) => void }) {
  return (
    <div className={CARD}>
      <h2 className="text-[1.25rem] font-extrabold">Хэддүгээр ангид сурдаг вэ?</h2>
      <p className="text-ink-2 font-medium mt-1.5 text-[.95rem]">
        Тест нь сонгосон ангийн хөтөлбөрөөс бүрдэнэ.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 mt-5">
        {Array.from({ length: 9 }, (_, i) => i + 4).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onPick(g)}
            className="bg-surface-2 border-[1.5px] border-line-2 rounded-md py-3.5 font-extrabold text-[1rem] hover:border-blue transition-colors"
          >
            {g}-р анги
          </button>
        ))}
      </div>
      <button type="button" onClick={onBack} className="mt-5 text-[.88rem] font-extrabold text-ink-3 hover:text-ink">
        ← Буцах
      </button>
    </div>
  );
}

function PaymentStep({
  track,
  fee,
  busy,
  onPay,
}: {
  track: AssessmentTrack;
  fee: string;
  busy: boolean;
  onPay: () => void;
}) {
  const isQuiz = track !== "olympiad";
  const bullets = isQuiz
    ? [
        "Ангийн хөтөлбөрт тохирсон сонголттой асуултууд гарч ирнэ",
        "Хариултаа сонгоод илгээнэ — цаас, бичиг шаардлагагүй",
        "Оноо болон хиймэл оюуны бичсэн зөвлөмж шууд гарна",
        "Үр дүн профайлд тань хадгалагдана",
      ]
    : [
        "Товч анкет бөглөнө",
        "Танд тохирох бодлогууд гарч ирнэ — амархан бол алгасаж, хүнд бол хөнгөрүүлнэ",
        "Сонгосон бодлогоо цаасан дээр бодоод зургаа оруулна",
        "Багшийн үнэлгээ профайлд тань ирнэ",
      ];
  return (
    <div className={CARD}>
      <h2 className="text-[1.3rem] font-extrabold">{TRACK_LABELS[track]}</h2>
      <p className="text-ink-2 font-medium mt-2.5 leading-[1.7]">
        {isQuiz
          ? "Богино тест бөглөөд хүүхдийнхээ өнөөгийн түвшинг мэдэж, юуг давтах, аль сургалт тохирохыг шууд олж мэдээрэй."
          : "Хэдэн асуултад хариулаад, өөрт тохирох хүндрэлийн бодлогуудаас сонгож бодно. Ганбат багш бодолтыг шалгаж, танд 1-10 хүртэлх түвшин болон хувийн зөвлөмж өгнө."}
      </p>

      <ol className="flex flex-col gap-2.5 mt-5">
        {bullets.map((text, i) => (
          <li key={text} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-soft text-blue-strong font-extrabold text-[.8rem] grid place-items-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="text-[.95rem] text-ink-2 font-medium">{text}</span>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-4 flex-wrap mt-6 pt-5 border-t border-line">
        <div>
          <small className="text-[.82rem] font-extrabold text-ink-3 block">
            {isQuiz ? "Тестийн төлбөр" : "Үнэлгээний төлбөр"}
          </small>
          <b className="text-[1.5rem] font-extrabold text-navy">{fee || "—"}</b>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onPay}
          className="inline-flex items-center justify-center gap-2 font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[30px] py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50"
        >
          {busy ? "Түр хүлээнэ үү…" : "Төлбөр төлөх →"}
        </button>
      </div>
    </div>
  );
}

function QpayWaitStep({
  fee,
  qrImage,
  shortUrl,
  busy,
  onCheck,
}: {
  fee: string;
  qrImage: string;
  shortUrl: string;
  busy: boolean;
  onCheck: () => void;
}) {
  return (
    <div className={`${CARD} text-center`}>
      <h2 className="text-[1.3rem] font-extrabold">QPay-ээр төлөх</h2>
      <p className="text-ink-2 font-medium mt-2.5">
        {fee} дүнгээ доорх QR-ийг банкны апп-аараа уншуулж төлнө үү.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/png;base64,${qrImage}`}
        alt="QPay QR код"
        className="w-[220px] h-[220px] mx-auto rounded-sm border border-line mt-5"
      />
      {shortUrl && (
        <a
          href={shortUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-[.9rem] font-bold text-blue-strong"
        >
          Эсвэл богино холбоосоор нээх →
        </a>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onCheck}
        className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50"
      >
        {busy ? "Шалгаж байна…" : "Төлбөр шалгах →"}
      </button>
      <p className="text-ink-3 font-medium text-[.82rem] mt-3">
        Төлбөр төлөгдмөгц энэ хуудас автоматаар үргэлжилнэ.
      </p>
    </div>
  );
}

function QuestionnaireStep({
  assessmentId,
  onDone,
}: {
  assessmentId: string;
  onDone: (a: Assessment) => void | Promise<void>;
}) {
  const [grade, setGrade] = useState("");
  const [age, setAge] = useState("");
  const [hasPrepared, setHasPrepared] = useState(false);
  const [hasCompeted, setHasCompeted] = useState(false);
  const [achievements, setAchievements] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!grade) {
      setError("Ангиа сонгоно уу");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/questionnaire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, age, hasPrepared, hasCompeted, achievements }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Алдаа гарлаа");
        return;
      }
      await onDone({ id: assessmentId, status: "questionnaire_done" } as Assessment);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className="text-[1.25rem] font-extrabold">Товч анкет</h2>
      <p className="text-ink-2 font-medium mt-1.5 mb-5 text-[.95rem]">
        Эхлэх түвшинг тань тааруулахад ашиглана.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
        <FormField label="Анги" required>
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Ангиа сонгоно уу</option>
            {Array.from({ length: 9 }, (_, i) => i + 4).map((g) => (
              <option key={g} value={`${g}-р анги`}>
                {g}-р анги
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Нас">
          <input
            type="number"
            min={5}
            max={25}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Жишээ: 13"
          />
        </FormField>
      </div>

      <div className="flex flex-col gap-3 mt-2 mb-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hasPrepared}
            onChange={(e) => setHasPrepared(e.target.checked)}
            className="w-[18px] h-[18px] mt-0.5 shrink-0"
          />
          <span className="font-semibold text-[.95rem] text-ink">
            Олимпиадад тусгайлан бэлтгэж байсан
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hasCompeted}
            onChange={(e) => setHasCompeted(e.target.checked)}
            className="w-[18px] h-[18px] mt-0.5 shrink-0"
          />
          <span className="font-semibold text-[.95rem] text-ink">Олимпиадад оролцож байсан</span>
        </label>
      </div>

      <FormField label="Ямар нэг амжилт байвал бичнэ үү" hint="Жишээ: Аймгийн олимпиад 2-р байр">
        <textarea
          value={achievements}
          onChange={(e) => setAchievements(e.target.value)}
          rows={3}
          placeholder="Байхгүй бол хоосон орхино уу"
        />
      </FormField>

      {error && <p className="text-red-soft font-semibold text-[.85rem] mb-3">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="w-full font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 mt-1.5 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
      >
        {busy ? "Хадгалж байна…" : "Бодлого руу шилжих →"}
      </button>
    </div>
  );
}

function SubmittedStep() {
  return (
    <div className={`${CARD} text-center`}>
      <h2 className="text-[1.25rem] font-extrabold">Бодолт хүлээн авлаа</h2>
      <p className="text-ink-2 font-medium mt-2.5">
        Багш таны ажлыг шалгаж байна. Дүгнэлт гарсны дараа профайл дээр тань харагдана.
      </p>
      <Link
        href="/profile/assessment"
        className="inline-flex items-center justify-center font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5"
      >
        Үр дүн харах
      </Link>
    </div>
  );
}

/**
 * The quiz itself: every question on one page, radio choices, one submit.
 * One page rather than one-question-at-a-time on purpose — parents sit next
 * to younger kids, and being able to scroll back and reconsider mirrors a
 * paper test, which is what this replaces.
 */
function QuizStep({
  assessmentId,
  onDone,
}: {
  assessmentId: string;
  onDone: (a: Assessment) => void;
}) {
  const [questions, setQuestions] = useState<PublicQuizQuestion[] | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/assessment/${assessmentId}/quiz`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Тест ачаалахад алдаа гарлаа");
          return;
        }
        setQuestions(json.questions);
      } catch {
        if (!cancelled) setError("Сүлжээний алдаа гарлаа. Хуудсаа шинэчилнэ үү.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: picked }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Илгээхэд алдаа гарлаа");
        return;
      }
      onDone(json.assessment);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !questions) {
    return <div className={`${CARD} text-center text-red-soft font-semibold`}>{error}</div>;
  }
  if (!questions) {
    return <div className={`${CARD} text-center text-ink-3 font-semibold`}>Тест ачаалж байна…</div>;
  }

  const answered = Object.keys(picked).length;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[1.25rem] font-extrabold">Тест</h2>
        <span className="text-[.88rem] font-extrabold text-ink-3">
          {answered} / {questions.length} хариулсан
        </span>
      </div>

      <ol className="flex flex-col gap-6 mt-5">
        {questions.map((q, qi) => (
          <li key={q.id}>
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-blue-soft text-blue-strong font-extrabold text-[.85rem] grid place-items-center shrink-0 mt-0.5">
                {qi + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[1rem] leading-[1.6]">
                  <MathText source={q.bodyLatex} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  {q.choices.map((choice, ci) => {
                    const chosen = picked[q.id] === ci;
                    return (
                      <button
                        key={ci}
                        type="button"
                        onClick={() => setPicked((prev) => ({ ...prev, [q.id]: ci }))}
                        className={`text-left rounded-md border-[1.5px] px-3.5 py-2.5 text-[.95rem] font-semibold transition-colors ${
                          chosen
                            ? "border-blue bg-blue-soft text-blue-strong"
                            : "border-line-2 bg-surface-2 hover:border-blue"
                        }`}
                      >
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="font-extrabold">{"АБВГ"[ci]}.</span>
                          <MathText source={choice} inline className="!text-inherit" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {error && <p className="text-red-soft font-semibold text-[.9rem] mt-4">{error}</p>}

      <button
        type="button"
        disabled={busy || answered === 0}
        onClick={submit}
        className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50"
      >
        {busy ? "Дүгнэж байна…" : "Тест дуусгах →"}
      </button>
      {answered < questions.length && answered > 0 && (
        <p className="text-ink-3 font-medium text-[.82rem] mt-2.5 text-center">
          Хариулаагүй асуулт буруу гэж тооцогдоно.
        </p>
      )}
    </div>
  );
}

function QuizResultStep({ assessment }: { assessment: Assessment }) {
  const score = assessment.quizScore ?? 0;
  const total = assessment.quizTotal ?? 0;
  return (
    <div className={CARD}>
      <div className="text-center">
        <span className="inline-grid place-items-center w-24 h-24 rounded-full bg-blue-soft">
          <b className="text-[1.6rem] font-extrabold text-blue-strong">
            {score}/{total}
          </b>
        </span>
        <h2 className="text-[1.3rem] font-extrabold mt-4">Тестийн үр дүн</h2>
      </div>

      {assessment.aiRecommendation && (
        <div className="bg-bg-soft rounded-md px-5 py-4 mt-5">
          <b className="font-extrabold text-[.95rem] block mb-2">Зөвлөмж</b>
          <p className="text-ink-2 font-medium leading-[1.75] whitespace-pre-wrap text-[.95rem]">
            {assessment.aiRecommendation}
          </p>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 flex-wrap mt-6">
        <Link
          href="/courses"
          className="inline-flex items-center justify-center font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-3.5 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
        >
          Сургалтууд үзэх →
        </Link>
        <Link href="/profile/assessment" className="font-extrabold text-[.9rem] text-blue-strong">
          Профайл дээрх үр дүн
        </Link>
      </div>
    </div>
  );
}
