import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProgramDetail from "@/components/program/ProgramDetail";

export const metadata: Metadata = {
  title: "1 жилийн хөтөлбөр — D ангилал — Б.Ганбат багш",
  description:
    "D ангилал (7–8-р анги) сурагчдад зориулсан, бүтэн жилийн хугацаанд дотоодын болон олон улсын олимпиадад бэлдэх онлайн, танхим хосолсон хөтөлбөр.",
};

export default function CourseDProgramPage() {
  return (
    <>
      <Navbar />
      <main>
        <ProgramDetail category="D" categoryWord="Д" grade="7–8" />
      </main>
      <Footer />
    </>
  );
}
