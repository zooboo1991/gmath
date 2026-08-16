import type { ArticleSummary } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";

/**
 * The articles an admin pinned to this course.
 *
 * Sits at the foot of every course page — the ordinary one, the classroom
 * classes and the yearly programmes — because the question it answers is the
 * same everywhere: a parent who has read the price and is not ready to decide
 * wants to see the teaching before they commit. Nothing pinned, nothing shown.
 */
export default function RelatedArticles({ articles }: { articles: ArticleSummary[] }) {
  if (articles.length === 0) return null;

  // Plain background: the related-courses strip below is the grey one, and two
  // grey bands in a row read as a single undivided block.
  //
  // Tighter on top than a normal section: the price card above it is also
  // white, so there is no colour change to mark the seam — the full stacked
  // padding just looked like the page had ended.
  return (
    <section className="pt-[clamp(24px,3vw,40px)] pb-[clamp(48px,7vw,88px)]">
      <div className="wrap">
        <div className="flex items-baseline gap-3.5 mb-[22px]">
          <h2 className="text-[1.4rem] font-extrabold">Холбоотой нийтлэл</h2>
          <span className="text-[.9rem] font-bold text-ink-3">Энэ сургалтын талаар дэлгэрэнгүй</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 gap-6">
          {articles.slice(0, 6).map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      </div>
    </section>
  );
}
