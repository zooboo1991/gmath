"use client";

import { useMemo, useState } from "react";
import CourseCard, { CourseMeta, VodStatus } from "@/components/CourseCard";
import { compareByStartDate } from "@/lib/courseDate";
import {
  COURSE_CATEGORIES,
  extractCourseCategories,
  getCourseAudience,
  type CourseAudience,
  type CourseCategory,
} from "@/lib/courseTag";
import type { Course } from "@/lib/db";

type AudienceFilter = "all" | CourseAudience;
type CategoryFilter = "all" | CourseCategory;

const PILL_BASE =
  "font-extrabold text-[.88rem] px-[16px] py-[9px] rounded-full border transition-colors shrink-0";

/**
 * Filtering happens in the browser rather than through the URL because the
 * whole list is a handful of rows — a round trip per pill tap would feel
 * broken on a phone, which is how most parents open this page.
 */
export default function CourseBrowser({ upcoming, vod }: { upcoming: Course[]; vod: Course[] }) {
  const [audience, setAudience] = useState<AudienceFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");

  // Only offer categories that some course actually carries, so the filter
  // never leads to a guaranteed-empty result.
  const availableCategories = useMemo(() => {
    const present = new Set<string>();
    for (const c of [...upcoming, ...vod]) {
      for (const cat of extractCourseCategories(c.tag)) present.add(cat);
    }
    return COURSE_CATEGORIES.filter((c) => present.has(c));
  }, [upcoming, vod]);

  const matches = useMemo(() => {
    return (course: Course) => {
      if (audience !== "all" && getCourseAudience(course.tag) !== audience) return false;
      if (category !== "all" && !extractCourseCategories(course.tag).includes(category)) return false;
      return true;
    };
  }, [audience, category]);

  // Soonest first for dated courses; recordings have no start date, so they
  // keep the admin's ordering.
  const upcomingShown = useMemo(
    () => upcoming.filter(matches).sort(compareByStartDate),
    [upcoming, matches]
  );
  const vodShown = useMemo(() => vod.filter(matches), [vod, matches]);

  const filtered = audience !== "all" || category !== "all";
  const totalShown = upcomingShown.length + vodShown.length;

  return (
    <div>
      <div className="flex flex-col gap-3 mb-8">
        <FilterRow label="Төрөл">
          <Pill active={audience === "all"} onClick={() => setAudience("all")}>
            Бүгд
          </Pill>
          <Pill active={audience === "student"} onClick={() => setAudience("student")}>
            Сурагч
          </Pill>
          <Pill active={audience === "teacher"} onClick={() => setAudience("teacher")}>
            Багш
          </Pill>
        </FilterRow>

        {availableCategories.length > 0 && (
          <FilterRow label="Ангилал">
            <Pill active={category === "all"} onClick={() => setCategory("all")}>
              Бүгд
            </Pill>
            {availableCategories.map((c) => (
              <Pill key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </Pill>
            ))}
          </FilterRow>
        )}

        {filtered && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[.88rem] font-bold text-ink-3">{totalShown} сургалт олдлоо</span>
            <button
              type="button"
              onClick={() => {
                setAudience("all");
                setCategory("all");
              }}
              className="text-[.85rem] font-extrabold text-blue-strong"
            >
              Шүүлтүүр цэвэрлэх
            </button>
          </div>
        )}
      </div>

      {filtered && totalShown === 0 ? (
        <div className="bg-surface border border-line rounded-md px-6 py-10 text-center">
          <p className="text-ink-2 font-medium max-w-[46ch] mx-auto">
            Энэ шүүлтүүрт тохирох сургалт алга байна. Өөр ангилал сонгох, эсвэл шүүлтүүрээ
            цэвэрлээд бүх сургалтыг үзнэ үү.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3.5 mb-[22px]">
            <h2 className="text-[1.4rem] font-extrabold">Удахгүй эхлэх сургалтууд</h2>
            <span className="text-[.9rem] font-bold text-ink-3">
              {upcomingShown.length} хөтөлбөр
            </span>
          </div>
          {upcomingShown.length === 0 ? (
            <CoursesEmpty
              text={
                filtered
                  ? "Энэ шүүлтүүрт тохирох, удахгүй эхлэх сургалт алга байна."
                  : "Одоогоор элсэлт авч байгаа сургалт алга байна. Дээрх жилийн хөтөлбөрүүдээс сонгох, эсвэл удахгүй дахин зочилно уу."
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 gap-5">
              {upcomingShown.map((c) => (
                <CourseCard
                  key={c.id}
                  tag={c.tag}
                  title={c.title}
                  topics={c.topics}
                  price={c.price}
                  period={c.period}
                  ctaHref={`/courses/${c.id}`}
                  ctaLabel="Дэлгэрэнгүй"
                  extra={<CourseMeta startDate={c.startDate ?? ""} mode={c.mode ?? ""} />}
                />
              ))}
            </div>
          )}

          <div className="flex items-baseline gap-3.5 mt-14 mb-[22px]">
            <h2 className="text-[1.4rem] font-extrabold">Бичлэгээр үзэх сургалтууд</h2>
            <span className="text-[.9rem] font-bold text-ink-3">
              Хүссэн үедээ нөхөж үзэх боломжтой
            </span>
          </div>
          {vodShown.length === 0 ? (
            <CoursesEmpty
              text={
                filtered
                  ? "Энэ шүүлтүүрт тохирох бичлэгээр үзэх сургалт алга байна."
                  : "Бичлэгээр үзэх сургалт удахгүй нэмэгдэнэ."
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 gap-5">
              {vodShown.map((c) => (
                <CourseCard
                  key={c.id}
                  tag={c.tag}
                  title={c.title}
                  topics={c.topics}
                  price={c.price}
                  period={c.period}
                  ctaHref={`/courses/${c.id}`}
                  ctaLabel="Дэлгэрэнгүй"
                  extra={<VodStatus />}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[.8rem] font-extrabold text-ink-3 uppercase tracking-[.06em] w-[62px] shrink-0">
        {label}
      </span>
      <div className="flex gap-2 overflow-x-auto py-0.5">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${PILL_BASE} ${
        active
          ? "bg-navy text-white border-navy"
          : "bg-surface text-ink-2 border-line hover:border-line-2"
      }`}
    >
      {children}
    </button>
  );
}

// An empty list used to render as a bare gap under the heading, leaving the
// visitor with nothing to read and nowhere to go.
function CoursesEmpty({ text }: { text: string }) {
  return (
    <div className="bg-surface border border-line rounded-md px-6 py-10 text-center">
      <p className="text-ink-2 font-medium max-w-[46ch] mx-auto">{text}</p>
      <a
        href="https://www.facebook.com/ganbat.surgalt/"
        target="_blank"
        rel="noreferrer"
        className="btn-ring inline-flex items-center justify-center gap-2 font-extrabold rounded-full bg-surface text-ink px-[26px] py-[14px] mt-5 transition-colors hover:text-blue-strong"
      >
        Facebook хуудсаас мэдээлэл авах <span>→</span>
      </a>
    </div>
  );
}
