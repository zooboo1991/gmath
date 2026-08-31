import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ContractObjectPage from "@/components/admin/ContractObjectPage";
import { requireAdminSection } from "@/lib/adminAccess";
import { findContractTemplate } from "@/lib/contracts/db";
import { listCourses, listRegistrationsByProgram, listYearlyPrograms } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Гэрээ — Админ" };

export default async function AdminContractPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSection("contracts");
  const { id } = await params;
  const template = await findContractTemplate(id);
  if (!template) notFound();

  const [yearly, courses] = await Promise.all([
    listYearlyPrograms().catch(() => []),
    listCourses(undefined, { includeDrafts: true }).catch(() => []),
  ]);

  const programs = [
    ...yearly.map((p) => ({ id: p.id, label: p.label || p.title, tag: p.tag, yearly: true })),
    ...courses.map((c) => ({ id: c.id, label: c.title, tag: c.tag, yearly: false })),
  ];

  // Гэрээ үүсгэхэд хэрэгтэй нэрсийг зөвхөн ХОЛБОГДСОН сургалтуудаас татна —
  // бүх сургалтын бүх сурагчийг ачаалах шаардлагагүй.
  const rosters = await Promise.all(
    template.programIds.map(async (programId) => ({
      programId,
      label: programs.find((p) => p.id === programId)?.label ?? programId,
      students: (await listRegistrationsByProgram(programId).catch(() => []))
        .filter((r) => r.status === "active" && r.user && !r.user.isTest)
        .map((r) => ({
          registrationId: r.id,
          name: `${r.user!.lastName} ${r.user!.firstName}`,
          phone: r.user!.phone,
          // Гэрээнд хэрэгтэй атал хоосон байгаа талбарууд — эзэн урьдчилж мэдэх ёстой.
          missing: [
            !r.user!.parentName && "эцэг эхийн нэр",
            !r.user!.parentRegister && "эцэг эхийн регистр",
            !r.user!.address && "гэрийн хаяг",
          ].filter((x): x is string => Boolean(x)),
        })),
    }))
  );

  return (
    <ContractObjectPage template={template} programs={programs} rosters={rosters} />
  );
}
