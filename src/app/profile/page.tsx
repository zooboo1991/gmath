import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import LogoutButton from "@/components/LogoutButton";
import { listRegistrationsByUser } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { IconCheckCircle, IconClock, IconMessenger } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Миний профайл — Б.Ганбат багш",
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  const registrations = user ? await listRegistrationsByUser(user.id) : [];

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Профайл" title="Миний хуудас" />

        <section className="section-pad">
          <div className="wrap max-w-[760px] mx-auto">
            {!user ? (
              <div className="text-center bg-surface border border-line rounded-lg shadow-sm px-8 py-14">
                <h2 className="text-[1.3rem] font-extrabold">Та нэвтрээгүй байна</h2>
                <p className="text-ink-2 mt-2.5 font-medium">
                  Профайл хэсэг нь бүртгүүлсэн сургалтуудынхаа мэдээллийг харах газар юм. Эхлээд
                  сургалт сонгож бүртгүүлэхэд танд акаунт үүснэ.
                </p>
                <Link
                  href="/courses"
                  className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-[oklch(0.32_0.06_70)] shadow-gold px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
                >
                  Сургалтууд үзэх →
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between bg-surface border border-line rounded-lg shadow-sm px-7 py-6">
                  <div>
                    <b className="text-[1.2rem] font-extrabold block">
                      {user.lastName} {user.firstName}
                    </b>
                    <span className="text-ink-3 font-semibold text-[.9rem]">
                      {user.role === "teacher" ? "Багш" : "Сурагч"} · {user.phone} · {user.email}
                    </span>
                  </div>
                  <LogoutButton />
                </div>

                <h2 className="text-[1.3rem] font-extrabold mt-10 mb-4">Миний сургалтууд</h2>

                {(() => {
                  if (registrations.length === 0) {
                    return (
                      <p className="text-ink-2 font-medium bg-bg-soft border border-line rounded-md px-6 py-8 text-center">
                        Та одоогоор ямар ч сургалтад бүртгүүлээгүй байна.{" "}
                        <Link href="/courses" className="text-blue-strong font-bold">
                          Сургалтууд үзэх →
                        </Link>
                      </p>
                    );
                  }
                  return (
                    <div className="flex flex-col gap-4">
                      {registrations.map((r) => (
                        <div key={r.id} className="bg-surface border border-line rounded-md shadow-xs px-6 py-5">
                          <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                              <b className="font-extrabold text-[1.05rem] block">{r.programLabel}</b>
                              <span className="text-ink-3 font-semibold text-[.85rem]">{r.price}</span>
                            </div>
                            {r.status === "active" ? (
                              <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
                                <IconCheckCircle className="w-3.5 h-3.5" /> Идэвхтэй
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-gold-strong bg-gold-soft px-3 py-1.5 rounded-full">
                                <IconClock className="w-3.5 h-3.5" /> Хүлээгдэж буй
                              </span>
                            )}
                          </div>

                          {r.status === "active" ? (
                            <div className="mt-4 pt-4 border-t border-line grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <a
                                href="https://www.facebook.com/ganbat.surgalt/"
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2.5 bg-blue-soft text-blue-strong font-bold text-[.9rem] rounded-sm px-4 py-3"
                              >
                                <IconMessenger className="w-[18px] h-[18px] shrink-0" /> Facebook группын линк
                              </a>
                              <div className="flex items-center gap-2.5 bg-bg-soft text-ink-2 font-bold text-[.9rem] rounded-sm px-4 py-3">
                                <IconClock className="w-[18px] h-[18px] shrink-0 text-ink-3" /> Хуваарь тун удахгүй
                              </div>
                            </div>
                          ) : (
                            <p className="mt-3 text-[.88rem] text-ink-3 font-semibold">
                              Админ төлбөрийг баталгаажуулсны дараа энд Facebook групп, хуваарийн
                              холбоос гарч ирнэ.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
