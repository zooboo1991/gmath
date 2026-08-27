"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { axisPositions, scoreTest, type PersonalityTest } from "@/lib/tests";

/** How far a stranger gets before the site asks who they are. */
const FREE_QUESTIONS = 3;
const KEYS = ["А", "Б", "В", "Г", "Д"];

const storageKey = (slug: string) => `gmath_test_${slug}`;

/** Another tab finishing the same test should not leave this one stale. */
function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * The quiz itself: one question at a time, an answer moves it forward.
 *
 * A visitor who is not signed in may answer the first few and is then asked
 * to register — their answers are kept in this browser, so coming back after
 * signing up resumes at the question they stopped on rather than the start.
 */
export default function TestRunner({
  test,
  signedIn,
  previousAnswers,
}: {
  test: PersonalityTest;
  signedIn: boolean;
  /** What they answered last time, if they have sat this test before. */
  previousAnswers?: number[];
}) {
  const [screen, setScreen] = useState<"intro" | "quiz" | "gate" | "result">("intro");
  const [answers, setAnswers] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // What this browser remembers from a run that stopped at the gate. Read
  // through useSyncExternalStore rather than an effect: the server has no
  // localStorage, so the first paint must match "nothing stored" and pick the
  // real value up on hydration.
  const storedRaw = useSyncExternalStore(
    subscribeToStorage,
    () => {
      try {
        return window.localStorage.getItem(storageKey(test.slug));
      } catch {
        return null;
      }
    },
    () => null
  );
  const stored = useMemo<number[]>(() => {
    if (!storedRaw) return [];
    try {
      const parsed = JSON.parse(storedRaw) as unknown;
      return Array.isArray(parsed) ? (parsed as number[]).slice(0, test.questions.length) : [];
    } catch {
      return [];
    }
  }, [storedRaw, test.questions.length]);

  const remember = (next: number[]) => {
    try {
      window.localStorage.setItem(storageKey(test.slug), JSON.stringify(next));
    } catch {
      // Nothing to do: the quiz still works, it just cannot be resumed.
    }
  };

  const answer = (choice: number) => {
    const next = [...answers];
    next[index] = choice;
    setAnswers(next);
    remember(next);

    // The gate: three answers from a stranger, then who are you?
    if (!signedIn && next.length >= FREE_QUESTIONS) {
      setScreen("gate");
      return;
    }
    if (index + 1 >= test.questions.length) {
      void finish(next);
      return;
    }
    setIndex(index + 1);
  };

  const finish = async (sheet: number[]) => {
    setScreen("result");
    window.scrollTo(0, 0);
    if (!signedIn) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/tests/${test.slug}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: sheet }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSaveError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      // Saved on the profile now; the local copy has done its job.
      try {
        window.localStorage.removeItem(storageKey(test.slug));
      } catch {
        // ignore
      }
    } catch {
      setSaveError("Сүлжээний алдаа гарлаа. Дүн профайлд хадгалагдаагүй.");
    } finally {
      setSaving(false);
    }
  };

  const start = (fresh: boolean) => {
    if (fresh) {
      setAnswers([]);
      setIndex(0);
      remember([]);
    } else {
      // Carrying on from the gate — the answers live in this browser.
      setAnswers(stored);
      setIndex(Math.min(stored.length, test.questions.length - 1));
    }
    setScreen("quiz");
    window.scrollTo(0, 0);
  };

  const unfinished = stored.length > 0 && stored.length < test.questions.length;

  // ---- intro -------------------------------------------------------------
  if (screen === "intro") {
    return (
      <section className="section-pad">
        <div className="wrap max-w-[640px] mx-auto">
          <span className="text-[.72rem] font-extrabold tracking-[.14em] uppercase text-blue-strong">
            {test.eyebrow}
          </span>
          <h1 className="text-[clamp(2rem,6vw,3rem)] font-extrabold leading-[1.1] tracking-[-.02em] mt-4 text-balance">
            {test.title}
          </h1>
          <p className="text-ink-2 font-medium text-[1.05rem] leading-[1.7] mt-4 max-w-[52ch]">
            {test.lede}
          </p>

          <div className="flex gap-7 flex-wrap border-y border-line py-4 my-7 text-[.85rem] font-semibold text-ink-3">
            <span>
              <b className="text-ink font-extrabold">{test.questions.length}</b> асуулт
            </span>
            <span>
              <b className="text-ink font-extrabold">{Object.keys(test.archetypes).length}</b> төрөл
            </span>
            <span>
              <b className="text-ink font-extrabold">{test.minutes}</b> минут
            </span>
          </div>

          {previousAnswers && (
            <p className="bg-green-soft text-green font-bold text-[.9rem] rounded-md px-4 py-3 mb-4">
              Та энэ тестийг өмнө өгсөн байна. Дахин өгвөл өмнөх үр дүн шинэчлэгдэнэ.
            </p>
          )}

          {/* Someone who stopped at the gate and has now signed up lands
              here: the unfinished sheet is the offer, not a fresh start. */}
          {unfinished ? (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => start(false)}
                className="font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[30px] py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
              >
                {stored.length + 1}-р асуултаас үргэлжлүүлэх →
              </button>
              <button
                type="button"
                onClick={() => start(true)}
                className="font-extrabold text-[.9rem] text-ink-3"
              >
                Эхнээс нь эхлэх
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => start(true)}
              className="font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[30px] py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
            >
              {previousAnswers ? "Дахин өгөх →" : "Эхлэх →"}
            </button>
          )}
        </div>
      </section>
    );
  }

  // ---- the registration gate --------------------------------------------
  if (screen === "gate") {
    return (
      <section className="section-pad">
        <div className="wrap max-w-[560px] mx-auto">
          <div className="bg-surface border border-line rounded-lg shadow-sm px-7 py-8 text-center">
            <span className="text-[.72rem] font-extrabold tracking-[.14em] uppercase text-blue-strong">
              {answers.length} / {test.questions.length} асуулт
            </span>
            <h2 className="text-[1.4rem] font-extrabold mt-3">Сайн эхэллээ!</h2>
            <p className="text-ink-2 font-medium leading-[1.7] mt-2.5">
              Үлдсэн {test.questions.length - answers.length} асуултад хариулж, өөрийн төрлөө мэдэхийн
              тулд бүртгүүлнэ үү. Үр дүн чиний профайлд хадгалагдаж, дараа ч харах боломжтой болно.
            </p>
            <p className="text-ink-3 font-semibold text-[.85rem] mt-3">
              Хариултууд чинь энэ хөтөч дээр хадгалагдсан — бүртгүүлээд буцаж ирэхэд{" "}
              {answers.length + 1}-р асуултаас үргэлжилнэ.
            </p>
            <Link
              href={`/profile?next=${encodeURIComponent(`/tests/${test.slug}`)}`}
              className="inline-flex items-center justify-center font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[30px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
            >
              Бүртгүүлэх / Нэвтрэх →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // ---- result ------------------------------------------------------------
  if (screen === "result") {
    const outcome = scoreTest(test, answers);
    const primary = test.archetypes[outcome.primaryCode];
    const secondary = outcome.secondaryCode ? test.archetypes[outcome.secondaryCode] : undefined;
    const total = Object.values(outcome.scores).reduce((a, b) => a + b, 0) || 1;
    const positions = axisPositions(test, outcome.scores);

    return (
      <section className="section-pad">
        <div className="wrap max-w-[640px] mx-auto">
          <svg viewBox="0 0 96 96" className="w-[96px] h-[96px] mb-5 test-glyph" aria-hidden="true">
            <g dangerouslySetInnerHTML={{ __html: primary.glyph }} />
          </svg>

          <p className="font-mono text-[.8rem] tracking-[.2em] text-blue-strong">
            {primary.code}
            {secondary ? ` × ${secondary.code}` : ""}
          </p>
          <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] font-extrabold leading-none mt-2">
            {primary.name}
          </h1>
          <p className="text-gold-strong font-bold text-[1.05rem] mt-2.5">{primary.tag}</p>
          <p className="text-ink-2 font-medium text-[1.02rem] leading-[1.75] mt-4">{primary.desc}</p>

          {secondary && (
            <p className="bg-gold-soft border-l-[3px] border-gold rounded-r-md px-5 py-4 mt-6 text-ink-2 font-medium">
              Хоёрдогч төрөл: <b className="text-gold-strong font-extrabold">{secondary.name}</b> —{" "}
              {secondary.tag.toLowerCase()}. Бодлого дээр гацахад чи ихэвчлэн энэ тал руугаа шилждэг.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div className="bg-surface border border-line rounded-md px-5 py-4">
              <h3 className="text-[.75rem] font-extrabold tracking-[.1em] uppercase text-blue-strong mb-2">
                Хүчтэй тал
              </h3>
              <p className="text-ink-2 font-medium text-[.95rem] leading-[1.6]">{primary.strong}</p>
            </div>
            <div className="bg-surface border border-line rounded-md px-5 py-4">
              <h3 className="text-[.75rem] font-extrabold tracking-[.1em] uppercase text-blue-strong mb-2">
                Анхаарах зүйл
              </h3>
              <p className="text-ink-2 font-medium text-[.95rem] leading-[1.6]">{primary.watch}</p>
            </div>
          </div>

          <h3 className="text-[.75rem] font-extrabold tracking-[.1em] uppercase text-blue-strong mt-9 mb-4">
            {test.axes.length} тэнхлэг
          </h3>
          {test.axes.map((axis, i) => {
            const value = positions[i];
            const width = Math.round(Math.abs(value) * 50);
            return (
              <div key={axis.left} className="mb-4">
                <div className="flex justify-between text-[.78rem] font-bold mb-1.5">
                  <span className={value < -0.1 ? "text-gold-strong" : "text-ink-3"}>{axis.left}</span>
                  <span className={value > 0.1 ? "text-gold-strong" : "text-ink-3"}>{axis.right}</span>
                </div>
                <div className="relative h-1.5 rounded-sm bg-line-2 overflow-hidden">
                  <span className="absolute left-1/2 top-0 w-px h-full bg-line" />
                  <span
                    className="absolute top-0 h-full bg-gold transition-[width] duration-700"
                    style={
                      value < 0
                        ? { right: "50%", width: `${width}%` }
                        : { left: "50%", width: `${width}%` }
                    }
                  />
                </div>
              </div>
            );
          })}

          <h3 className="text-[.75rem] font-extrabold tracking-[.1em] uppercase text-blue-strong mt-9 mb-4">
            {Object.keys(test.archetypes).length} төрөл дэх байрлал
          </h3>
          <div className="flex flex-col gap-1.5">
            {outcome.order.map((key, i) => (
              <div
                key={key}
                className={`flex items-center justify-between px-4 py-2.5 rounded-md text-[.92rem] ${
                  i === 0
                    ? "bg-gold-soft text-ink font-extrabold"
                    : i === 1
                      ? "bg-blue-soft text-ink font-bold"
                      : "bg-surface text-ink-2 font-semibold"
                }`}
              >
                <span>{test.archetypes[key].name}</span>
                <b className="font-mono text-[.85rem] tabular-nums">
                  {Math.round((outcome.scores[key] / total) * 100)}%
                </b>
              </div>
            ))}
          </div>

          <div className="border-t border-line mt-9 pt-5">
            <p className="text-ink-3 font-semibold text-[.9rem]">{test.note}</p>
            {signedIn ? (
              <p className="text-[.9rem] font-bold mt-3">
                {saving ? (
                  <span className="text-ink-3">Профайлд хадгалж байна…</span>
                ) : saveError ? (
                  <span className="text-red-soft">{saveError}</span>
                ) : (
                  <span className="text-green">✓ Үр дүн профайлд хадгалагдлаа</span>
                )}
              </p>
            ) : (
              <p className="text-[.9rem] font-bold text-gold-strong mt-3">
                Бүртгүүлбэл энэ үр дүн профайлд чинь хадгалагдана.
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap mt-5">
              <button
                type="button"
                onClick={() => start(true)}
                className="font-extrabold text-[.9rem] rounded-full bg-blue text-white shadow-blue px-6 py-3"
              >
                Дахин өгөх
              </button>
              <Link href="/tests" className="font-extrabold text-[.9rem] text-blue-strong">
                Бусад тест →
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ---- one question ------------------------------------------------------
  const question = test.questions[index];
  return (
    <section className="section-pad">
      <div className="wrap max-w-[640px] mx-auto">
        <div className="flex gap-1.5 mb-6">
          {test.questions.map((_, i) => (
            <span
              key={i}
              className={`flex-1 h-1.5 rounded-sm ${
                i < index ? "bg-blue" : i === index ? "bg-gold" : "bg-line-2"
              }`}
            />
          ))}
        </div>

        <p className="font-mono text-[.8rem] tracking-[.18em] text-blue-strong mb-3">
          {String(index + 1).padStart(2, "0")} / {test.questions.length}
        </p>
        <h1 className="text-[clamp(1.3rem,4.4vw,1.7rem)] font-extrabold leading-[1.35] mb-6 text-balance">
          {question.q}
        </h1>

        <div className="flex flex-col gap-2.5">
          {question.options.map((option, i) => (
            <button
              key={i}
              type="button"
              onClick={() => answer(i)}
              className="flex items-start gap-3.5 text-left bg-surface border border-line rounded-md px-4 py-4 transition-colors hover:border-gold hover:bg-gold-soft/40"
            >
              <span className="w-7 h-7 shrink-0 rounded-full border border-line-2 grid place-items-center font-mono text-[.8rem] text-blue-strong">
                {KEYS[i]}
              </span>
              <span className="font-semibold text-[.98rem] leading-[1.5]">{option.text}</span>
            </button>
          ))}
        </div>

        {index > 0 && (
          <button
            type="button"
            onClick={() => setIndex(index - 1)}
            className="font-extrabold text-[.88rem] text-ink-3 mt-6"
          >
            ← Буцах
          </button>
        )}
      </div>
    </section>
  );
}
