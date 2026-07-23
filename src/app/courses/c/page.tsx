import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProgramDetail from "@/components/program/ProgramDetail";

export const metadata: Metadata = {
  title: "1 жилийн хөтөлбөр — C ангилал — Б.Ганбат багш",
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
