import Link from "next/link";
import Reveal from "./Reveal";
import { IconPerson } from "./icons";
import type { Article } from "@/lib/db";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("mn-MN", { year: "numeric", month: "short", day: "numeric" });
}

export default function ArticleCard({ article }: { article: Article }) {
  return (
    <Reveal>
      <Link href={`/articles/${article.id}`} className="group flex flex-col">
        <div className="aspect-[4/3] rounded-md overflow-hidden bg-bg-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverImage}
            alt=""
            width={640}
            height={480}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        <h3 className="text-[1.1rem] font-extrabold mt-4 tracking-[-.01em] leading-[1.3] group-hover:text-blue-strong transition-colors">
          {article.title}
        </h3>
        <p className="text-[.92rem] text-ink-2 mt-1.5 font-medium leading-[1.55] line-clamp-2">
          {article.excerpt}
        </p>
        <div className="flex items-center gap-2.5 mt-4">
          <span className="w-6 h-6 rounded-full bg-bg-soft grid place-items-center shrink-0">
            <IconPerson className="w-3.5 h-3.5 text-ink-3" />
          </span>
          <span className="text-[.85rem] text-ink-3 font-semibold">
            {article.author} · {formatDate(article.createdAt)}
          </span>
        </div>
      </Link>
    </Reveal>
  );
}
