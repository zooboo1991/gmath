import katex from "katex";

/**
 * Renders a problem statement written as Mongolian prose with embedded LaTeX
 * to HTML. `$...$` is inline math, `$$...$$` is a centred display block;
 * everything outside the delimiters is plain text.
 *
 * The result is inserted with dangerouslySetInnerHTML, so every path here has
 * to produce trusted markup:
 *  - prose is HTML-escaped by us before it is concatenated
 *  - KaTeX runs with `trust: false` (its default), which disables \href,
 *    \includegraphics and the other commands that can emit arbitrary markup
 *  - `maxExpand` caps macro expansion so a hand-written \def loop can't hang
 *    the server
 *
 * Called from server components for student-facing pages, which keeps the
 * ~78KB KaTeX bundle out of the browser entirely; the admin editor imports it
 * from a client component for the live preview, so it ships only on /admin.
 */

const KATEX_OPTIONS = {
  trust: false,
  strict: false as const,
  maxExpand: 1000,
  throwOnError: false,
  output: "html" as const,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Splits on $$...$$ first so a display block isn't mistaken for two inline
 * spans. Unclosed delimiters fall through as literal text rather than
 * swallowing the rest of the statement.
 */
const SEGMENT_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

export function renderMathToHtml(source: string): string {
  if (!source) return "";

  return source
    .split(SEGMENT_RE)
    .map((segment) => {
      const isDisplay = segment.startsWith("$$") && segment.endsWith("$$") && segment.length > 4;
      const isInline = !isDisplay && segment.startsWith("$") && segment.endsWith("$") && segment.length > 2;
      if (!isDisplay && !isInline) {
        // Plain prose: escape it, and keep the author's line breaks.
        return escapeHtml(segment).replace(/\n/g, "<br />");
      }

      const tex = isDisplay ? segment.slice(2, -2) : segment.slice(1, -1);
      try {
        return katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode: isDisplay });
      } catch {
        // throwOnError:false already renders most bad input in red, so this
        // only catches the rarer hard failures.
        return `<code class="text-red-soft">${escapeHtml(segment)}</code>`;
      }
    })
    .join("");
}

/**
 * True when the source has at least one delimiter pair worth rendering.
 * Uses its own non-global regex: calling .test() on SEGMENT_RE would advance
 * its lastIndex and make consecutive calls disagree.
 */
const SEGMENT_TEST_RE = new RegExp(SEGMENT_RE.source);

export function hasMath(source: string): boolean {
  return SEGMENT_TEST_RE.test(source);
}
