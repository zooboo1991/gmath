import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import GradingDetail from "@/components/admin/GradingDetail";
import { listLevels } from "@/lib/assessment/db";
import { buildGradingDetail } from "@/lib/assessment/gradingDetail";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Бодолт шалгах — Админ хэсэг",
};

export default async function GradingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }
  const { id } = await params;

  const [detail, levels] = await Promise.all([buildGradingDetail(id), listLevels()]);
  if (!detail) notFound();

  return <GradingDetail detail={detail} levels={levels} />;
}
