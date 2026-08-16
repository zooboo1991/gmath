import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import { IconTrophy } from "@/components/icons";

export const metadata: Metadata = {
  title: "Манай баг",
  description: "Б.Ганбат багшийн математикийн сургалтын багийн танилцуулга — олимпиадын алтан медальт багш нар.",
};

type TeamMember = {
  slug?: string;
  photo?: string;
  name: string;
  role: string;
  achievements?: string[];
};

const team: TeamMember[] = [
  {
    slug: "ganbat",
    photo: "/images/teacher-photo.jpg",
    name: "Б.ГАНБАТ",
    role: "Үүсгэн байгуулагч · Олимпиадын багш",
    achievements: [
      "Монголын математикийн олимпиадын Дархан аварга",
      "Олон улсын багш, дасгалжуулагчдын олимпиадын алтан медаль",
    ],
  },
  {
    slug: "batchimeg",
    photo: "/images/batchimeg-photo.jpg",
    name: "Б.БАТЧИМЭГ",
    role: "Ахлах багш",
    achievements: ["Алтан гадас одонт багш", "Улсын математикийн олимпиадын аварга"],
  },
  {
    name: "Т.ЗОЛБОО",
    role: "Менежер",
  },
];

export default function TeamPage() {
  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Манай баг" title="Хоёр алтан медальт багш, нэг зорилго" />

        <section className="section-pad">
          <div className="wrap">
            <p className="max-w-[640px] mx-auto text-center text-[1.05rem] text-ink-2 font-medium">
              Математикийн олимпиадын бэлтгэлд хамгийн чухал зүйл бол багш. Бид хүүхэд бүрийг олон улсын
              түвшинд өрсөлдөх чадвартай багш нарын гарт даатгахыг эрхэмлэдэг.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 gap-6 mt-[44px] max-w-[980px] mx-auto">
              {team.map((member) => (
                <div key={member.name} className="card-flat flex flex-col overflow-hidden">
                  <div className="relative aspect-[4/5] bg-bg-soft">
                    {member.photo ? (
                      <Image
                        src={member.photo}
                        alt={member.name}
                        fill
                        sizes="(min-width: 980px) 30vw, 90vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="w-20 h-20 rounded-full bg-surface border border-line grid place-items-center text-ink-3 font-extrabold text-[1.2rem]">
                          {member.name
                            .split(" ")
                            .map((p) => p[0])
                            .join("")}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="px-6 py-6 flex flex-col flex-1">
                    <b className="text-[1.1rem] font-extrabold tracking-[-.01em]">{member.name}</b>
                    <span className="text-[.88rem] text-blue-strong font-bold mt-0.5">{member.role}</span>

                    {member.achievements && (
                      <div className="flex flex-col gap-2 mt-4">
                        {member.achievements.map((a) => (
                          <div key={a} className="flex items-start gap-2 text-[.86rem] text-ink-2 font-semibold">
                            <IconTrophy className="w-4 h-4 text-gold-strong shrink-0 mt-0.5" />
                            {a}
                          </div>
                        ))}
                      </div>
                    )}

                    {member.slug && (
                      <Link
                        href={`/team/${member.slug}`}
                        className="inline-flex items-center gap-1.5 font-extrabold text-[.88rem] text-blue-strong mt-auto pt-5"
                      >
                        Дэлгэрэнгүй <span>→</span>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
