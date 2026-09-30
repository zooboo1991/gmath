/**
 * How an olympiad paper adds up, and how the teacher's final conclusion is
 * laid out. Client-safe: the grading page, the grading list and the child's
 * report all read this, so the three can never disagree on the total.
 */

/** Every olympiad problem is marked out of this many points. */
export const POINTS_PER_PROBLEM = 10;

/**
 * The most a paper can earn: every problem the child was given. On a composed
 * exam paper that includes one they gave up on ("Бодож чадсангүй") — it just
 * earns 0. Sittings from the old adaptive walk (no examId) also recorded every
 * card the child passed over ("too_easy", "dont_know" meaning "show me
 * another"); only the ones they chose to solve were ever on their paper.
 */
export function maxPaperScore(actions: readonly string[], fromExam: boolean): number {
  const onPaper = actions.filter((action) => action === "solving" || (fromExam && action === "dont_know"));
  return onPaper.length * POINTS_PER_PROBLEM;
}

/**
 * A score as the score route will store it — 0 to 10, one decimal — or
 * undefined for anything it would refuse. The live total on the grading page
 * adds these, so it matches what the child sees once the paper is finished.
 */
export function parsePoints(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const points = Number(raw);
  if (!Number.isFinite(points) || points < 0 || points > POINTS_PER_PROBLEM) return undefined;
  return Math.round(points * 10) / 10;
}

/** "78 / 100" — how a total is written everywhere it appears. */
export function formatPaperScore(total: number, max: number): string {
  return `${formatPoints(total)} / ${formatPoints(max)}`;
}

/** Scores go in half points, so 7.5 must not print as 7.500000001. */
function formatPoints(points: number): string {
  return String(Math.round(points * 10) / 10);
}

/**
 * The parts of the teacher's final conclusion, in order. The teacher types
 * them as plain headings in one text box; the child's report shows each one
 * as a small title. A conclusion written before this (or without the
 * headings) is still shown as it was typed.
 */
export const CONCLUSION_SECTIONS = ["Чадвар", "Үнэлгээ", "Сайжруулах зүйлс"] as const;

/** What "Гарчиг оруулах" puts into an empty conclusion box. */
export const CONCLUSION_TEMPLATE = CONCLUSION_SECTIONS.map((heading) => `${heading}\n`).join("\n");

export type ConclusionBlock = { heading?: string; body: string };

/** Case, spacing and a leading bullet or number don't make a different heading. */
function headingKey(text: string): string {
  return text
    .replace(/^\s*(?:[•\-*]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Splits a conclusion at its section headings. A heading is a line that is
 * one of CONCLUSION_SECTIONS on its own, or followed by a colon and the first
 * words of the section ("Чадвар: тэгшитгэл сайн зохиодог"). Without the colon
 * a sentence that merely starts with the word ("Чадвар сайн") stays text.
 */
export function splitConclusion(text: string): ConclusionBlock[] {
  const blocks: ConclusionBlock[] = [];
  let current: { heading?: string; lines: string[] } = { lines: [] };
  const flush = () => {
    const body = current.lines.join("\n").trim();
    if (current.heading || body) blocks.push({ heading: current.heading, body });
  };
  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    const head = headingKey(colon === -1 ? line : line.slice(0, colon));
    const heading = CONCLUSION_SECTIONS.find((section) => headingKey(section) === head);
    if (heading) {
      flush();
      const rest = colon === -1 ? "" : line.slice(colon + 1).trim();
      current = { heading, lines: rest ? [rest] : [] };
    } else {
      current.lines.push(line);
    }
  }
  flush();
  return blocks;
}
