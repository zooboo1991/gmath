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
import { requireAdminSection } from "@/lib/adminAccess";

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
  const [payments, articleIds, articles] = await Promise.all([
    listPaymentsForRegistrations(registrations.map((r) => r.id)),
    listArticleIdsForProgram(id),
    listArticles({ includeScheduled: true }),
  ]);

  return (
    <YearlyProgramObjectPage
      program={program}
      initialRegistrations={registrations}
      initialPayments={payments}
      articleOptions={articles.map((a) => ({ id: a.id, title: a.title, createdAt: a.createdAt }))}
      initialArticleIds={articleIds}
      canEdit={role === "full"}
    />
  );
}
