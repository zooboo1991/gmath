/**
 * Сонирхолтой тестүүд: a short quiz that tells a child something about how
 * they think, not whether they are right.
 *
 * A test is a value, not a database row — new ones arrive as a file in this
 * folder. The shape below is everything a test needs: what it asks, what the
 * answers add up to, and what each outcome says.
 */

/** One outcome a child can land on. */
export type Archetype = {
  /** Three-letter code shown as "ГЕО × АЛГ". */
  code: string;
  name: string;
  /** One line under the name. */
  tag: string;
  desc: string;
  strong: string;
  watch: string;
  /** Inline SVG body (no <svg> wrapper), drawn in the accent colour. */
  glyph: string;
};

export type Question = {
  q: string;
  /** Each option: what it says, and the points it adds to archetypes. */
  options: { text: string; points: Record<string, number> }[];
};

/** A spectrum the answers place the child on, from one named end to the other. */
export type Axis = {
  left: string;
  right: string;
  /** Archetype keys that pull towards each end. */
  leftKeys: string[];
  rightKeys: string[];
};

export type PersonalityTest = {
  slug: string;
  title: string;
  /** Small line above the title. */
  eyebrow: string;
  lede: string;
  /** Shown on the tests list. */
  summary: string;
  minutes: number;
  archetypes: Record<string, Archetype>;
  questions: Question[];
  axes: Axis[];
  /** Closing line under the result. */
  note: string;
};

/** What the child ends up with, computed from their answers. */
export type TestOutcome = {
  scores: Record<string, number>;
  /** Archetype keys, strongest first. */
  order: string[];
  primaryCode: string;
  secondaryCode?: string;
};
