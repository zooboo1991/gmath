import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CourseObjectPage from "@/components/admin/CourseObjectPage";
import { findCourseById, listRegistrationsByProgram } from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Сургалт — Админ хэсэг",
};

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  // Section "courses", not "courseEditor": the read-only account may open
  // this page, it just arrives with canEdit=false.
  const role = await requireAdminSection("courses");

  const { id } = await params;
  const course = await findCourseById(id);
  if (!course) notFound();

  const registrations = await listRegistrationsByProgram(id);

  return <CourseObjectPage course={course} initialRegistrations={registrations} canEdit={role === "full"} />;
}
