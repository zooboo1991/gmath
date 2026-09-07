import type { Metadata } from "next";
import { notFound } from "next/navigation";
import YearlyProgramObjectPage from "@/components/admin/YearlyProgramObjectPage";
import {
  findYearlyProgramById,
  listArticleIdsForProgram,
  listArticles,
  listPaymentsForRegistrations,
  listRegistrationsByProgram,
} from "@/lib/db";
import { listProgramWaitlist } from "@/lib/programWaitlist";
import { requireAdminSection } from "@/lib/adminAccess";
import { can } from "@/lib/adminSections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "1 жилийн хөтөлбөр — Админ хэсэг",
};

export default async function EditYearlyProgramPage({ params }: { params: Promise<{ id: string }> }) {
  // Section "courses": readable by the read-only account, with canEdit=false.
  const role = await requireAdminSection("courses");

  const { id } = await params;
  const program = await findYearlyProgramById(id);
  if (!program) notFound();

  const registrations = await listRegistrationsByProgram(id);
  const [payments, articleIds, articles, waitlist] = await Promise.all([
    listPaymentsForRegistrations(registrations.map((r) => r.id)),
    listArticleIdsForProgram(id),
    listArticles({ includeScheduled: true }),
    // Дараалал уншигдахгүй байх нь хөтөлбөрийн хуудсыг унагах шалтгаан биш.
    listProgramWaitlist(id).catch(() => []),
  ]);

  return (
    <YearlyProgramObjectPage
      program={program}
      initialRegistrations={registrations}
      initialPayments={payments}
      initialWaitlist={waitlist}
      articleOptions={articles.map((a) => ({ id: a.id, title: a.title, createdAt: a.createdAt }))}
      initialArticleIds={articleIds}
      canEdit={can(role, "courseInfo")}
      canEditLessons={can(role, "lessons")}
      canManageRegistrations={can(role, "registrations")}
    />
  );
}
