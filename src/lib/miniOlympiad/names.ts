import { nameKey } from "../bankStatement/text";
import type { OlympiadRosterEntry } from "./db";

/**
 * Who a written name is — client-safe, so the admin screen can match scan file
 * names ("D Zamandi.pdf", "Б. Монхгарьд.pdf") the same way the server matches
 * workbook rows.
 *
 * A wrong match shows one family another child's work, so a child is picked
 * outright only when the written name spells out their surname and first name,
 * in that order, and no other child could be meant. Anything weaker — a first
 * name alone, an initial, a reversed order — is only suggested, for the admin
 * to confirm.
 */

type Token = { key: string; initial: boolean };

// Hyphens stay inside a word: "Бат-Эрдэнэ" is one first name, not "Бат" + "Эрдэнэ".
const tokensOf = (name: string): Token[] =>
  name
    .split(/[^A-Za-zА-Яа-яЁёӨөҮү-]+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .map((w) => ({ key: nameKey(w), initial: w.replace(/-/g, "").length <= 2 }))
    .filter((t) => t.key.length > 0);

// Words a scan's file name carries besides the child's name.
const NOISE = new Set(
  ["бодолт", "bodolt", "скан", "scan", "page", "хуудас", "huudas", "зураг", "zurag", "img", "image", "photo", "мини", "mini", "олимпиад", "olympiad", "olimpiad"].map(nameKey)
);

export type NameMatch = {
  /** The child the name surely points at: surname and first name spelled out, and nobody else fits. */
  userId: string | null;
  /** The only child the name fits, on weaker evidence — for the admin to confirm. */
  suggestion: string | null;
  /** Every child the name fits, for the admin to choose from. */
  candidates: string[];
};

/**
 * How a surname word and a written word agree: "full" as whole words, or
 * "initial" when one side is only a letter ("Б." for Батхүрэл, or a child
 * registered as "Э Хишиг"). One letter is never enough to settle who it is —
 * on scans it is often the programme ("D Anungoo").
 */
function agreement(surname: Token, written: Token): "full" | "initial" | null {
  if (written.initial) return surname.key.startsWith(written.key) ? "initial" : null;
  if (surname.initial) return written.key.startsWith(surname.key) ? "initial" : null;
  return surname.key === written.key ? "full" : null;
}

export function matchName(written: string, roster: OlympiadRosterEntry[]): NameMatch {
  const said = tokensOf(written);
  // Surname first, first name last: "Бат Болд" is Бат's child Болд, not "Болд Бат".
  const lastWord = said.filter((t) => !t.initial && !NOISE.has(t.key)).at(-1)?.key;
  const sure: string[] = [];
  const byFirst: string[] = [];
  for (const p of roster) {
    const words = tokensOf(p.name);
    const first = words[words.length - 1];
    if (!first || first.initial) continue;
    const surnames = words.slice(0, -1);
    if (!said.some((t) => !t.initial && t.key === first.key)) continue;
    const others = said.filter((t) => t.key !== first.key && !NOISE.has(t.key));
    // "Дорж Тэмүүлэн" is not "Болд Тэмүүлэн". A lone letter never contradicts — it may be the programme.
    if (others.some((t) => !t.initial && !surnames.some((s) => agreement(s, t)))) continue;
    byFirst.push(p.userId);
    const inOrder = lastWord === first.key;
    const fullySaid = surnames.length > 0 && surnames.every((s) => others.some((t) => agreement(s, t) === "full"));
    if (fullySaid && inOrder) sure.push(p.userId);
  }
  // Picked only when nobody else fits at all — a namesake who is merely not ruled out still counts.
  const userId = sure.length === 1 && byFirst.length === 1 ? sure[0] : null;
  return {
    userId,
    suggestion: !userId && byFirst.length === 1 ? byFirst[0] : null,
    candidates: byFirst,
  };
}
