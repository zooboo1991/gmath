import type { Metadata } from "next";
import { notFound } from "next/navigation";
import YearlyProgramObjectPage from "@/components/admin/YearlyProgramObjectPage";
import { findYearlyProgramById, listPaymentsForRegistrations, listRegistrationsByProgram } from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "1 жилийн хөтөлбөр — Админ хэсэг",
};

export default async function EditYearlyProgramPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSection("courseEditor");

  const { id } = await params;
  const program = await findYearlyProgramById(id);
  if (!program) notFound();

  const registrations = await listRegistrationsByProgram(id);
  const payments = await listPaymentsForRegistrations(registrations.map((r) => r.id));

  return <YearlyProgramObjectPage program={program} initialRegistrations={registrations} initialPayments={payments} />;
}
