import "katex/dist/katex.min.css";
import { renderMathToHtml } from "@/lib/assessment/math";

/**
 * Renders a problem statement (Mongolian prose with embedded LaTeX).
 *
 * Deliberately has no "use client": in a server component the KaTeX bundle
 * stays on the server, and a client component that imports this still works —
 * it just pays for KaTeX in that route's bundle, which is why only the admin
 * editor's live preview does so.
 *
 * renderMathToHtml escapes the prose and runs KaTeX with trust:false, so its
 * output is safe to inject here.
 */
export default function MathText({ source, className = "" }: { source: string; className?: string }) {
  return (
    <div
      className={`leading-[1.75] text-ink [&_.katex]:text-[1.05em] ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMathToHtml(source) }}
    />
  );
}
