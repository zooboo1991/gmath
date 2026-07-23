import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import HashScroll from "@/components/HashScroll";
import ProgramRegisterProvider from "@/components/program/ProgramRegister";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Ганбат багш — Олимпиадын математикийн онлайн сургалт",
  description:
    "4–12-р ангийн сурагчдад зориулсан олимпиадын математикийн онлайн сургалт. Б.Ганбат багшийн 10 жилийн туршлагад суурилсан системтэй хөтөлбөр.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn" className={`${nunito.variable} scroll-smooth scroll-pt-[76px]`}>
      <body className="bg-bg text-ink font-sans text-[17px] font-medium leading-[1.6] antialiased">
        <HashScroll />
        <ProgramRegisterProvider>{children}</ProgramRegisterProvider>
      </body>
    </html>
  );
}
