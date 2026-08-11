import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import Analytics from "@/components/Analytics";
import ChatWidget from "@/components/ChatWidget";
import HashScroll from "@/components/HashScroll";
import ProgramRegisterProvider from "@/components/program/ProgramRegister";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { SITE_URL } from "@/lib/siteUrl";
import "./globals.css";

// Cyrillic + latin means every weight here is two font files. 900 was used
// by exactly one decorative number (now 800), so it is dropped; 400 stays as
// the fallback weight for rich-text article bodies.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const SITE_NAME = "Б.Ганбат багшийн математикийн сургалт";
const DESCRIPTION =
  "4–12-р ангийн сурагчдад зориулсан олимпиадын математикийн онлайн сургалт. Б.Ганбат багшийн 10 жилийн туршлагад суурилсан системтэй хөтөлбөр.";

// The site is shared almost entirely through Facebook, where a link with no
// Open Graph tags renders as a bare grey box. metadataBase also lets every
// page's own metadata use relative image paths.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Ганбат багш — Олимпиадын математикийн онлайн сургалт",
    template: "%s — Б.Ганбат багш",
  },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "mn_MN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Ганбат багш — Олимпиадын математикийн онлайн сургалт",
    description: DESCRIPTION,
    images: [{ url: "/images/mascot-single.png", width: 1350, height: 1552, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ганбат багш — Олимпиадын математикийн онлайн сургалт",
    description: DESCRIPTION,
    images: ["/images/mascot-single.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn" className={`${nunito.variable} scroll-smooth scroll-pt-[76px]`}>
      <body className="bg-bg text-ink font-sans text-[17px] font-medium leading-[1.6] antialiased">
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important;animation:none!important}`}</style>
        </noscript>
        <HashScroll />
        <Analytics />
        <ServiceWorkerRegister />
        <ProgramRegisterProvider>{children}</ProgramRegisterProvider>
        <ChatWidget />
      </body>
    </html>
  );
}
