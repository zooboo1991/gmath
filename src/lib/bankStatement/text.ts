import { transliterate } from "@/lib/mnTransliterate";

/**
 * Text helpers for reading a bank transfer's description ("Гүйлгээний утга").
 *
 * Parents type the student's name however their banking app lets them — in
 * Cyrillic, in Latin with "kh"/"h", "u"/"ü"/"o" for ө and ү, doubled or
 * dropped vowels ("Jargalbayr" for Жаргалбаяр). Both sides are reduced to the
 * same rough Latin key, so "Төгөлдөр", "Tuguldur" and "Toguldor" compare equal.
 */
export function nameKey(word: string): string {
  return transliterate(word)
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/kh/g, "h")
    .replace(/ye|yo/g, "e")
    .replace(/yu/g, "u")
    .replace(/ya/g, "a")
    .replace(/o/g, "u")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
}

// Words that say what the transfer is for, not who it is for.
const STOP_WORDS = new Set(
  [
    "сурагч", "suragch", "сургалт", "surgalt", "сургалтын", "surgaltiin", "төлбөр", "tulbur",
    "төлбөрийн", "tulburiin", "анги", "angi", "ангилал", "angilal", "ангийн", "үлдэгдэл",
    "uldegdel", "хаанаас", "haanaas", "qpay", "mat", "math", "матем", "хөтөлбөр",
    "hutulbur", "жил", "jil", "жилийн", "сар", "sar", "сарын", "тэгш", "tegsh", "сондгой",
    "sondgoi", "өдөр", "udur", "өглөө", "ugluu", "шалгалт", "shalgalt", "түвшин", "tuvshin",
    "данс", "dans", "гүйлгээ", "орлого", "orlogo", "илгээв", "төлөв", "сургууль", "surguuli",
    "олимпиад", "olimpiad", "сонгон", "songon", "бэлтгэл", "нэмэлт", "төлөх", "tulsun",
  ].map(nameKey)
);

/** The distinct name-like words of a description, as keys (3+ letters, no stop words). */
export function descriptionWords(description: string): string[] {
  const words = description.split(/[^A-Za-zА-Яа-яЁёӨөҮү]+/).filter(Boolean);
  const keys = words.map(nameKey).filter((k) => k.length >= 3 && !STOP_WORDS.has(k));
  return [...new Set(keys)];
}

/** Mongolian mobile numbers (8 digits, 6–9 first) written anywhere in the text. */
export function phonesIn(description: string): string[] {
  // Not inside a longer token: "gm-c-88ebe446cf76424393b0" holds "76424393",
  // "ФВ91090511" is a register number.
  return [...new Set(description.match(/(?<![\p{L}\d])[6-9]\d{7}(?![\p{L}\d])/gu) ?? [])];
}

export type QpayRef = { kind: "c" | "i" | "p" | "a"; hex: string };

/**
 * The gmath QPay invoice code in a settlement line ("QPAY 6121…, GM-C-E720C6…").
 * The bank cuts it short, so only a prefix of the dash-less id survives.
 */
export function qpayRefIn(description: string): QpayRef | null {
  const m = description.match(/gm-([cipa])-([0-9a-f]{6,32})/i);
  return m ? { kind: m[1].toLowerCase() as QpayRef["kind"], hex: m[2].toLowerCase() } : null;
}

export function looksLikeQpay(description: string): boolean {
  return /\bqpay\b/i.test(description) || qpayRefIn(description) !== null;
}

/**
 * The programme letter a payer wrote ("89191535 D Сурагч", "c angilal",
 * "Буян-Очир D.99138869"). Cyrillic С/Д count as C/D. An initial before a
 * name ("Д.Мөнхболд", "Мөнхболд Д"), a school class ("6 д анги"), the QPay
 * code's "GM-C-" and the "-с" ("from") suffix of a payer's name do not.
 */
export function categoryHint(description: string): string | null {
  // Not after a 1–2 digit class number ("6 д анги", "6-р д анги", "6r d angi");
  // a phone before it is fine.
  const m = description.match(
    /(?<!(?:^|\D)\d{1,2}\s*-?\s*(?:р|r)?\s*-?\s*)(?:^|\s)([CDСД])(?=\s*(?:\+|\.\d|сурагч|suragch|ангилал|angilal|анги|angi))/iu
  );
  if (!m) return null;
  const letter = m[1].toUpperCase();
  return letter === "С" ? "C" : letter === "Д" ? "D" : letter;
}

/** Levenshtein distance, stopping early once it exceeds `max`. */
export function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Digits only, last 8 — how a phone number field is compared. */
export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : "";
}
