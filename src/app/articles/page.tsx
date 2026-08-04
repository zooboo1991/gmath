import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ArticleCard from "@/components/ArticleCard";
import { listArticleSummaries } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Нийтлэл",
  description: "Б.Ганбат багшийн олимпиадын математикийн сургалттай холбоотой нийтлэл, зөвлөгөөнүүд.",
};

const PAGE_SIZE = 9;

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const articles = await listArticleSummaries();

  if (articles.length === 0) {
    return (
      <>
        <Navbar />
        <main>
          <section className="section-pad">
            <div className="wrap">
              <div className="max-w-[560px] mx-auto text-center bg-surface border border-line rounded-lg shadow-sm px-[32px] py-[52px] mt-8">
                <h2 className="text-[1.5rem] font-extrabold tracking-[-.01em]">Тун удахгүй нээгдэнэ</h2>
                <p className="text-[1rem] text-ink-2 mt-3 font-medium">
                  Багшийн зөвлөгөө, олимпиадад бэлдэх арга зүй, сурган хүмүүжлийн нийтлэлүүдийг энд
                  удахгүй нийтэлж эхэлнэ. Түр хүлээгээд дараа дахин зочилно уу.
                </p>
                <Link
                  href="/courses"
                  className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-[16px] mt-8 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
                >
                  Сургалтууд үзэх <span>→</span>
                </Link>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const featured = articles.find((a) => a.featured) ?? articles[0];
  const rest = articles.filter((a) => a.id !== featured.id);

  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const requestedPage = Number((await searchParams).page ?? "1");
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(1, Math.trunc(requestedPage)), totalPages) : 1;
  const pageItems = rest.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <Navbar />
      <main>
        {/* Visually hidden — the featured article's own heading (page 1) or
            the grid heading (later pages) is the visible page title. Kept in
            the document (not deleted) so there's still a top-level heading
            for search engines and screen readers. */}
        <h1 className="sr-only">Нийтлэл, зөвлөгөө</h1>

        {page === 1 && (
          <section className="pt-7 pb-0">
            <div className="wrap">
              <Link
                href={`/articles/${featured.id}`}
                className="group relative flex flex-col justify-end min-h-[420px] sm:min-h-[480px] rounded-lg overflow-hidden shadow-md"
              >
                {/* This is the page's LCP element: decode it eagerly and reserve
                    its box so an admin-uploaded cover cannot shift the layout. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featured.coverImage}
                  alt=""
                  width={1200}
                  height={630}
                  fetchPriority="high"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(5,15,35,.88)_0%,rgba(5,15,35,.35)_55%,rgba(5,15,35,.05)_100%)]" />
                <div className="relative px-6 py-8 sm:px-10 sm:py-10 flex items-end justify-between gap-6">
                  <div className="max-w-[640px]">
                    <span className="text-[.78rem] font-extrabold tracking-[.12em] uppercase text-gold">
                      Онцлох
                    </span>
                    <h2 className="text-[1.7rem] sm:text-[2.2rem] font-extrabold text-white leading-[1.15] tracking-[-.01em] mt-2">
                      {featured.title}
                    </h2>
                    <p className="text-[.98rem] sm:text-[1.02rem] text-white/80 font-medium leading-[1.6] mt-3 line-clamp-2">
                      {featured.excerpt}
                    </p>
                  </div>
                  <span className="hidden sm:grid shrink-0 w-14 h-14 rounded-full bg-white/15 place-items-center text-white text-[1.4rem] transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </div>
              </Link>
            </div>
          </section>
        )}

        {rest.length > 0 && (
          <section className={page === 1 ? "section-pad" : "section-pad !pt-8"}>
            <div className="wrap">
              <h2 className="text-[1.3rem] font-extrabold tracking-[-.01em] mb-6">Сүүлийн нийтлэлүүд</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-10">
                {pageItems.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>

              {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-2 mt-12" aria-label="Хуудаслалт">
                  <Link
                    href={`/articles?page=${page - 1}`}
                    aria-disabled={page <= 1}
                    className={`inline-flex items-center justify-center font-extrabold text-[.9rem] rounded-full px-5 py-2.5 transition-colors ${
                      page <= 1
                        ? "pointer-events-none text-ink-3 bg-bg-soft opacity-50"
                        : "text-ink-2 bg-bg-soft hover:text-blue-strong"
                    }`}
                  >
                    ← Өмнөх
                  </Link>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <Link
                      key={n}
                      href={`/articles?page=${n}`}
                      className={`inline-flex items-center justify-center w-10 h-10 font-extrabold text-[.9rem] rounded-full transition-colors ${
                        n === page ? "bg-navy text-white" : "text-ink-2 bg-bg-soft hover:text-blue-strong"
                      }`}
                    >
                      {n}
                    </Link>
                  ))}
                  <Link
                    href={`/articles?page=${page + 1}`}
                    aria-disabled={page >= totalPages}
                    className={`inline-flex items-center justify-center font-extrabold text-[.9rem] rounded-full px-5 py-2.5 transition-colors ${
                      page >= totalPages
                        ? "pointer-events-none text-ink-3 bg-bg-soft opacity-50"
                        : "text-ink-2 bg-bg-soft hover:text-blue-strong"
                    }`}
                  >
                    Дараах →
                  </Link>
                </nav>
              )}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
