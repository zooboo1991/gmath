import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CourseObjectPage from "@/components/admin/CourseObjectPage";
import {
  findCourseById,
  listArticleIdsForProgram,
  listArticles,
  listPaymentsForRegistrations,
  listRegistrationsByProgram,
} from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";
import { can } from "@/lib/adminSections";

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
  const [payments, articleIds, articles] = await Promise.all([
    // Хуваан төлөлт нь зөвхөн жилийн хөтөлбөрийнх биш: сонгон ангид ч
    // хагасаар нь төлдөг. Төлбөрийн мөрийг эндээс уншихгүй бол roster нь
    // үлдэгдлийн баганаа огт үзүүлэхгүй, хагас төлсөн сурагч бүтэн төлсөн
    // мэт харагдана.
    listPaymentsForRegistrations(registrations.map((r) => r.id)),
    listArticleIdsForProgram(id),
    // Scheduled articles are offered too: a course page written today may well
    // want to point at next week's post. The public page still hides it until
    // it goes live.
    listArticles({ includeScheduled: true }),
  ]);

  return (
    <CourseObjectPage
      course={course}
      initialRegistrations={registrations}
      initialPayments={payments}
      articleOptions={articles.map((a) => ({ id: a.id, title: a.title, createdAt: a.createdAt }))}
      initialArticleIds={articleIds}
      canEdit={can(role, "courseInfo")}
      canEditLessons={can(role, "lessons")}
      canManageRegistrations={can(role, "registrations")}
    />
  );
}
