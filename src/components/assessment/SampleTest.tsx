"use client";

import { useState } from "react";
import MathText from "@/components/assessment/MathText";
import type { PublicQuizQuestion } from "@/lib/assessment/types";

/**
 * The free taster: five questions, no sign-in, no payment.
 *
 * This exists because the assessment page used to be a login wall — a parent
 * had to create an account and pay before seeing a single question. Letting
 * them try five first is the standard move (Kumon's free diagnostic, AoPS's
 * self-diagnostic) and it costs us nothing but five marked questions.
 *
 * Scoring happens server-side and the reply carries no answer key, so the
 * result can be trusted and the questions stay usable.
 */
export default function SampleTest({ grades }: { grades: number[] }) {
  const [grade, setGrade] = useState<number | null>(null);
  const [questions, setQuestions] = useState<PublicQuizQuestion[] | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; total: number; wrongTopics: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (g: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessment/sample?grade=${g}`);
      const json = await res.json();
      if (!res.ok || !json.questions?.length) {
        setError("Энэ ангийн жишээ асуулт хараахан бэлэн болоогүй байна.");
        return;
      }
      setGrade(g);
      setQuestions(json.questions);
      setPicked({});
      setResult(null);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assessment/sample/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: picked }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Дүгнэхэд алдаа гарлаа");
        return;
      }
      setResult({ score: json.score, total: json.total, wrongTopics: json.wrongTopics ?? [] });
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setGrade(null);
    setQuestions(null);
    setPicked({});
    setResult(null);
  };

  return (
    <div className="card-flat px-[26px] py-[26px]">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[.72rem] font-extrabold tracking-[.1em] uppercase text-green bg-green-soft px-2.5 py-1 rounded-full">
          Үнэгүй
        </span>
        <h2 className="text-[1.2rem] font-extrabold">5 асуултаар туршиж үзээрэй</h2>
      </div>
      <p className="text-ink-2 font-medium mt-2 text-[.95rem] leading-[1.7]">
        Бүртгэл, төлбөр шаардлагагүй. Асуултууд ямар байдгийг харж, хүүхдээ хэр хэмжээнд байгааг
        ойролцоогоор мэдэх боломжтой.
      </p>

      {error && <p className="text-red-soft font-semibold text-[.88rem] mt-3">{error}</p>}

      {/* Grade first: a 4th grader and a 9th grader must never see the same five. */}
      {!questions && (
        <>
          <span className="block text-[.85rem] font-extrabold text-ink-3 mt-5 mb-2.5">
            Хэддүгээр ангид сурдаг вэ?
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
            {grades.map((g) => (
              <button
                key={g}
                type="button"
                disabled={busy}
                onClick={() => start(g)}
                className="bg-surface-2 border-[1.5px] border-line-2 rounded-md py-3 font-extrabold text-[.95rem] hover:border-blue transition-colors disabled:opacity-50"
              >
                {g}-р анги
              </button>
            ))}
          </div>
        </>
      )}

      {questions && !result && (
        <>
          <ol className="flex flex-col gap-5 mt-5">
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

          <button
            type="button"
            disabled={busy || Object.keys(picked).length === 0}
            onClick={submit}
            className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50"
          >
            {busy ? "Дүгнэж байна…" : "Хариуг харах →"}
          </button>
        </>
      )}

      {result && (
        <div className="mt-5">
          <div className="text-center">
            <span className="inline-grid place-items-center w-20 h-20 rounded-full bg-blue-soft">
              <b className="text-[1.4rem] font-extrabold text-blue-strong">
                {result.score}/{result.total}
              </b>
            </span>
            <p className="text-ink-2 font-medium mt-3 leading-[1.7] max-w-[46ch] mx-auto">
              {suggestion(result.score, result.total, grade)}
            </p>
            {result.wrongTopics.length > 0 && (
              <p className="text-ink-3 font-semibold text-[.88rem] mt-2">
                Давтах нь зүйтэй: {result.wrongTopics.join(", ")}
              </p>
            )}
          </div>

          {/* The taster's job is to make the paid version the obvious next step,
              which means being specific about what it adds. */}
          <div className="bg-bg-soft rounded-md px-4 py-4 mt-5">
            <b className="block font-extrabold text-[.95rem]">Бүрэн тест нь юугаараа өөр вэ?</b>
            <ul className="flex flex-col gap-1.5 mt-2">
              {[
                "10 асуулт — түвшинг илүү нарийн тодорхойлно",
                "Сэдэв тус бүрээр алдааны дүн шинжилгээ",
                "Хиймэл оюун таны хүүхдэд тусгайлан зөвлөмж бичнэ",
                "Үр дүн профайлд хадгалагдаж, ахицыг хожим харна",
              ].map((t) => (
                <li key={t} className="text-[.88rem] text-ink-2 font-medium">
                  · {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-center mt-5">
            <button
              type="button"
              onClick={reset}
              className="text-[.88rem] font-extrabold text-ink-2 bg-surface-2 px-5 py-3 rounded-full"
            >
              Дахин турших
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Plain-language read of the taster. Deliberately vague about level: five questions cannot place a child, and pretending otherwise would undercut the real test. */
function suggestion(score: number, total: number, grade: number | null): string {
  const ratio = total > 0 ? score / total : 0;
  const g = grade ? `${grade}-р ангийн` : "";
  if (ratio >= 0.8) {
    return `Сайн байна — ${total} асуултаас ${score}-д зөв хариулсан. ${g} хөтөлбөрийн суурь бат бөх байна. Сонгон ангийн тестийг эсвэл олимпиадын түвшин тогтоолтыг үзэхийг зөвлөж байна.`;
  }
  if (ratio >= 0.5) {
    return `${total} асуултаас ${score}-д зөв хариулсан. Суурь ойлголт байгаа ч бататгах зай бий. Бүрэн тест аль сэдэв дээр анхаарахыг тодорхой хэлж өгнө.`;
  }
  return `${total} асуултаас ${score}-д зөв хариулсан. Суурийг бататгахаас эхлэх нь зөв. Бүрэн тест яг хаанаас эхлэхийг тодорхойлж, багшийн зөвлөмж өгнө.`;
}
