/**
 * Deterministic Mongolian-Cyrillic collation.
 *
 * `a.localeCompare(b, "mn")` must never be used on a list that both the server
 * and the browser render: Node's full-ICU collator and Chrome's disagree —
 * Node sorted "Архангай Жаргалант ЁБС" ahead of "Sant", Chrome the reverse —
 * which hydration-mismatches the surrounding tree and leaves the page
 * non-interactive. Exactly the trap lib/dateFormat.ts exists for.
 *
 * Cyrillic letters follow the Mongolian alphabet (Ө and Ү in their proper
 * places, unlike raw code-point order); everything else — Latin school names,
 * digits — sorts after them, in code-point order.
 */

const MN_ALPHABET = "АБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЩЪЫЬЭЮЯ";

const RANK = new Map<string, number>();
MN_ALPHABET.split("").forEach((ch, i) => {
  RANK.set(ch, i);
  RANK.set(ch.toLowerCase(), i);
});

function rank(ch: string): number {
  return RANK.get(ch) ?? MN_ALPHABET.length + (ch.codePointAt(0) ?? 0);
}

export function compareMn(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = rank(a[i]) - rank(b[i]);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}
