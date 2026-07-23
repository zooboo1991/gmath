import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { listAllRegistrations, listCourses } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Админ хэсэг — Б.Ганбат багш",
};

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const [registrations, courses] = await Promise.all([listAllRegistrations(), listCourses()]);

  return <AdminDashboard initialRegistrations={registrations} initialCourses={courses} />;
}
