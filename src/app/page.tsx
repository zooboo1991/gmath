import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import About from "@/components/About";
import WhyUs from "@/components/WhyUs";
import Testimonials from "@/components/Testimonials";
import Courses from "@/components/Courses";
import Faq from "@/components/Faq";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";
import JsonLd, { organizationSchema } from "@/components/JsonLd";

// Courses now reads which courses to show from the database (admin-editable
// "Нүүр хуудсанд харуулах" checkbox) instead of a hardcoded list, so this
// page must be read fresh on every request rather than cached as static
// output at build time — same reasoning as /courses/page.tsx.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <JsonLd data={organizationSchema} />
      <Navbar />
      <main id="top">
        <Hero />
        <About />
        <WhyUs />
        <Testimonials />
        <Courses />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
