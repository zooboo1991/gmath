import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProgramDetail from "@/components/program/ProgramDetail";

// Price/label are admin-editable (see /admin/yearly), so this can't be
// cached as static output at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "1 жилийн хөтөлбөр — C ангилал",
  description:
    "C ангилал (5–6-р анги) сурагчдад зориулсан, бүтэн жилийн хугацаанд дотоодын болон олон улсын олимпиадад бэлдэх онлайн, танхим хосолсон хөтөлбөр.",
};

export default function CourseCProgramPage() {
  return (
    <>
      <Navbar />
      <main>
        <ProgramDetail category="C" categoryWord="С" grade="5–6" />
      </main>
      <Footer />
    </>
  );
}
