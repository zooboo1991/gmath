/**
 * Best-effort Mongolian Cyrillic -> Latin transliteration for SMS. Skytel's
 * Web2SMS gateway garbles Cyrillic text (confirmed via a live OTP send —
 * see lib/otp.ts), so every notification SMS goes out transliterated
 * instead. The OTP message sidestepped this by being one hardcoded Latin
 * string; admin-authored notification text is free-form, so it needs an
 * actual character mapping.
 */

const MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "ye",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  ө: "u",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ү: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  "—": "-",
  "–": "-",
  "«": '"',
  "»": '"',
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "№": "N",
};

function transliterateChar(ch: string): string {
  const lower = ch.toLowerCase();
  const mapped = MAP[lower];
  if (mapped === undefined) return ch;
  if (ch !== lower && mapped.length > 0) {
    return mapped[0].toUpperCase() + mapped.slice(1);
  }
  return mapped;
}

export function transliterate(text: string): string {
  const converted = Array.from(text).map(transliterateChar).join("");
  // Final safety net: strip anything still outside printable ASCII so a
  // stray character (emoji, other script) can't silently garble the send.
  return converted.replace(/[^\x20-\x7e]/g, "");
}
