import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import ProfileClient from "@/components/profile/ProfileClient";
import { listCertificatesByPhone, listRegistrationsByUser, toPublicUser } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { TESTS } from "@/lib/tests";
import { listTestResults } from "@/lib/tests/db";
import { listOnboardingByProgram } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Миний профайл",
};

export default async function ProfilePage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <Navbar />
        <main>
          <PageHero eyebrow="Профайл" title="Миний хуудас" />
          <section className="section-pad">
            <div className="wrap max-w-[760px] mx-auto">
              <div className="text-center bg-surface border border-line rounded-lg shadow-sm px-8 py-14">
                <h2 className="text-[1.3rem] font-extrabold">Та нэвтрээгүй байна</h2>
                <p className="text-ink-2 mt-2.5 font-medium">
                  Профайл хэсэг нь бүртгүүлсэн сургалтуудынхаа мэдээллийг харах газар юм. Эхлээд
                  сургалт сонгож бүртгүүлэхэд танд акаунт үүснэ.
                </p>
                <Link
                  href="/courses"
                  className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
                >
                  Сургалтууд үзэх →
                </Link>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const [registrations, certificates, testResults, onboarding] = await Promise.all([
    listRegistrationsByUser(user.id),
    // certificates is a newer table — a site that hasn't run the latest
    // schema.sql yet shouldn't have its whole profile page go down over it.
    listCertificatesByPhone(user.phone).catch(() => []),
    // Тестүүд: what the child learned about how they think.
    listTestResults(user.id).catch(() => []),
    // Эхлэлийн чеклистийн төлөв. Хүснэгт нь шинэ — schema.sql-ээ ажиллуулаагүй
    // орчинд профайл бүхэлдээ унах ёсгүй.
    listOnboardingByProgram(user.id).catch(() => ({})),
  ]);

  const tests = testResults
    .map((result) => {
      const test = TESTS.find((t) => t.slug === result.testSlug);
      const archetype = test?.archetypes[result.primaryCode];
      return test && archetype
        ? {
            slug: test.slug,
            title: test.title,
            archetype: archetype.name,
            tag: archetype.tag,
            takenAt: result.createdAt,
          }
        : null;
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <>
      <Navbar />
      <main>
        <ProfileClient
          user={toPublicUser(user)}
          registrations={registrations}
          certificates={certificates}
          tests={tests}
          onboarding={onboarding}
          nowIso={new Date().toISOString()}
        />
      </main>
      <Footer />
    </>
  );
}
