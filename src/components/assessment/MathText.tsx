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
export default function MathText({
  source,
  className = "",
  inline = false,
}: {
  source: string;
  className?: string;
  /**
   * Renders a <span> instead of the default <div>. Needed wherever the text
   * sits on the same line as something else — a quiz choice's "А." label, for
   * instance, otherwise the block element pushes the answer onto its own line.
   */
  inline?: boolean;
}) {
  const html = { __html: renderMathToHtml(source) };
  const classes = `leading-[1.75] text-ink [&_.katex]:text-[1.05em] ${className}`;
  if (inline) {
    return <span className={`inline ${classes}`} dangerouslySetInnerHTML={html} />;
  }
  return <div className={classes} dangerouslySetInnerHTML={html} />;
}
