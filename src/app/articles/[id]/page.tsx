import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ArticleCard from "@/components/ArticleCard";
import { IconFacebook, IconPerson } from "@/components/icons";
import JsonLd, { SITE_URL } from "@/components/JsonLd";
import { findArticleById, listArticleSummaries } from "@/lib/db";
import { isHtmlContent } from "@/lib/articleContent";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("mn-MN", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const article = await findArticleById(id);
  if (!article) return { title: "Нийтлэл олдсонгүй" };
  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `/articles/${article.id}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.excerpt,
      publishedTime: article.createdAt,
      authors: [article.author],
      images: article.coverImage ? [{ url: article.coverImage, alt: article.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
      images: article.coverImage ? [article.coverImage] : undefined,
    },
  };
}

export default async function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await findArticleById(id);
  if (!article) notFound();

  // Fetch one extra so removing the current article still leaves three.
  const related = (await listArticleSummaries(4)).filter((a) => a.id !== article.id).slice(0, 3);
  const isHtml = isHtmlContent(article.content);
  const paragraphs = isHtml ? [] : article.content.split("\n").map((p) => p.trim()).filter(Boolean);

  const articleUrl = `${SITE_URL}/articles/${article.id}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.excerpt,
          inLanguage: "mn",
          datePublished: article.createdAt,
          author: { "@type": "Person", name: article.author },
          publisher: {
            "@type": "EducationalOrganization",
            name: "Б.Ганбат багшийн математикийн сургалт",
            url: SITE_URL,
          },
          mainEntityOfPage: `${SITE_URL}/articles/${article.id}`,
          ...(article.coverImage ? { image: article.coverImage } : {}),
        }}
      />
      <Navbar />
      <main>
        <div className="wrap max-w-[720px] mx-auto pt-8">
          {/* Matches the text column below rather than running full-bleed —
              at 720px wide, floor-to-ceiling edge-to-edge made the cover
              look stretched/cropped compared to the article body. */}
          <div className="relative h-[220px] sm:h-[360px] overflow-hidden rounded-lg">
            {/* LCP element for this page — reserve its box and load it eagerly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.coverImage}
              alt=""
              width={1600}
              height={800}
              fetchPriority="high"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(5,15,35,.55)_0%,rgba(5,15,35,.05)_60%)]" />
          </div>
        </div>

        <section className="section-pad !pt-10">
          <div className="wrap max-w-[720px] mx-auto">
            <h1 className="text-[1.9rem] sm:text-[2.3rem] font-extrabold leading-[1.2] tracking-[-.01em]">
              {article.title}
            </h1>
            <div className="flex items-center justify-between gap-4 flex-wrap mt-5">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-bg-soft grid place-items-center shrink-0">
                  <IconPerson className="w-4 h-4 text-ink-3" />
                </span>
                <span className="text-[.92rem] text-ink-3 font-semibold">
                  {article.author} · {formatDate(article.createdAt)}
                </span>
              </div>
              <a
                href={facebookShareUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 font-extrabold text-[.85rem] text-blue-strong bg-blue-soft px-4 py-2 rounded-full shrink-0"
              >
                <IconFacebook className="w-4 h-4" /> Facebook-т хуваалцах
              </a>
            </div>

            <div className="h-px bg-line my-8" />

            {isHtml ? (
              <div
                className="prose prose-lg max-w-none prose-headings:font-extrabold prose-p:text-ink-2 prose-p:leading-[1.75] prose-li:text-ink-2 prose-a:text-blue-strong prose-img:rounded-md"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            ) : (
              <div className="flex flex-col gap-5">
                {paragraphs.map((p, i) => (
                  <p key={i} className="text-[1.05rem] text-ink-2 leading-[1.75] font-medium">
                    {p}
                  </p>
                ))}
              </div>
            )}

            <Link
              href="/articles"
              className="inline-flex items-center gap-2 font-extrabold text-[.92rem] text-blue-strong mt-10"
            >
              ← Бүх нийтлэл
            </Link>
          </div>
        </section>

        {related.length > 0 && (
          <section className="section-pad !pt-0">
            <div className="wrap">
              <div className="h-px bg-line mb-10" />
              <h2 className="text-[1.3rem] font-extrabold tracking-[-.01em] mb-6">Бусад нийтлэл</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-10">
                {related.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
