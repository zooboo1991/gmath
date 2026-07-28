import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CourseDetail, { type RelatedCourse } from "@/components/program/CourseDetail";
import { findCourseById, listCourses } from "@/lib/db";
import { yearlyPrograms } from "@/lib/staticPrograms";

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

  const allCourses = await listCourses();
  const otherDbCourses = allCourses.filter((c) => c.id !== course.id);
  const related: RelatedCourse[] = [
    ...otherDbCourses.map((c) => ({
      tag: c.tag,
      title: c.title,
      topics: c.topics,
      price: c.price,
      period: c.period,
      href: `/courses/${c.id}`,
    })),
    ...yearlyPrograms,
  ].slice(0, 3);

  return (
    <>
      <Navbar />
      <main>
        <CourseDetail course={course} related={related} />
      </main>
      <Footer />
    </>
  );
}
