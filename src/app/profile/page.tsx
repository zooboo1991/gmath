import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import LogoutButton from "@/components/LogoutButton";
import ProfileClient from "@/components/profile/ProfileClient";
import { listRegistrationsByUser, toPublicUser } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Миний профайл — Б.Ганбат багш",
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

  const registrations = await listRegistrationsByUser(user.id);

  return (
    <>
      <Navbar />
      <main>
        <ProfileClient user={toPublicUser(user)} registrations={registrations} />
        <div className="wrap max-w-[760px] mx-auto pb-8 flex justify-center">
          <LogoutButton />
        </div>
      </main>
      <Footer />
    </>
  );
}
