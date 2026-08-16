import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CourseDetail, { type RelatedCourse } from "@/components/program/CourseDetail";
import SonginDetail from "@/components/program/SonginDetail";
import JsonLd, { SITE_URL } from "@/components/JsonLd";
import { findCourseById, listPublishedCourseSummaries, listYearlyPrograms } from "@/lib/db";
import { toIsoDate } from "@/lib/courseDate";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const course = await findCourseById(id);
  if (!course || course.status !== "published") return { title: "Сургалт олдсонгүй" };
  return {
    title: `${course.title} — ${course.tag}`,
    description: course.topics,
  };
}

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await findCourseById(id);
  if (!course || course.status !== "published") notFound();

  // Four, so dropping the current course still leaves three to show.
  const [otherCourses, yearlyPrograms] = await Promise.all([
    listPublishedCourseSummaries(4),
    listYearlyPrograms(),
  ]);
  const otherDbCourses = otherCourses.filter((c) => c.id !== course.id);
  const related: RelatedCourse[] = [
    ...otherDbCourses.map((c) => ({
      tag: c.tag,
      title: c.title,
      topics: c.topics,
      price: c.price,
      period: c.period,
      href: `/courses/${c.id}`,
    })),
    ...yearlyPrograms.map((p) => ({
      tag: p.tag,
      title: p.title,
      topics: p.topics,
      price: p.price,
      period: p.period,
      href: `/courses/${p.id.replace("program-", "")}`,
    })),
  ].slice(0, 3);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Course",
          name: course.title,
          description: course.topics,
          url: `${SITE_URL}/courses/${course.id}`,
          inLanguage: "mn",
          provider: {
            "@type": "EducationalOrganization",
            name: "Б.Ганбат багшийн математикийн сургалт",
            url: SITE_URL,
          },
          ...(course.coverImage ? { image: course.coverImage } : {}),
          hasCourseInstance: {
            "@type": "CourseInstance",
            courseMode: course.mode === "Онлайн" ? "online" : "blended",
            ...(course.startDate ? { startDate: toIsoDate(course.startDate) } : {}),
          },
        }}
      />
      <Navbar />
      <main>
        {/* `template` picks the layout; every course without one keeps the
            page it has always had. */}
        {course.template === "songon" ? (
          <SonginDetail course={course} related={related} />
        ) : (
          <CourseDetail course={course} related={related} />
        )}
      </main>
      <Footer />
    </>
  );
}
