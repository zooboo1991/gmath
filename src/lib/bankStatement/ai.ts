import { claudeChat } from "../ai/providers/claude";
import type { BankTransaction, RosterEntry } from "./db";

/**
 * AI guesses for the transfers the rules could not place. Only ever a
 * suggestion: the row stays in review until the admin accepts it.
 *
 * Always Claude, never the AI_PROVIDER switch: the descriptions and the roster
 * carry children's names, and the DeepSeek provider processes data in China.
 * Phone numbers are left out of the roster — the rules already matched every
 * phone they could.
 */

export type AiSuggestion = {
  transactionId: string;
  registrationId: string;
  confidence: "medium" | "low";
  reason: string;
};

/** Transfers per model call; the route pages through the rest. */
export const AI_BATCH = 40;
const MAX_STUDENTS = 400;

const SYSTEM = `You match incoming bank transfers of a Mongolian olympiad-maths school to the student each one pays for.

Parents type the description themselves: the student's name in Cyrillic or Latin with loose spelling ("Jargalbayr" for Жаргалбаяр, "Tuguldur"/"Төгөлдөр"), sometimes an initial ("Б.Итгэл"), the programme letter (C/D), the class ("5 r angi"), or a phone. Mongolian patronymics: a child's last name is usually the father's first name, so a payer called "НАЦАГДОРЖ" may be paying for "Нацагдорж Заманди". The bank appends "ХААНААС: <code> <PAYER FULL NAME>" — that is the payer, usually a parent.

Usual amounts: 1-year programme 2,800,000 (halves 1,400,000; early families 2,520,000 / 1,260,000); classroom group 1,200,000 (halves 600,000, or 580,000 after a 20,000 placement credit).

Only link a transfer when the description gives a concrete clue to that student (name, patronymic, spelling variant). Never link on the amount alone. Owner transfers, loans and unrelated payments must be left out.

Reply with JSON only, no prose:
{"matches":[{"t":<transfer number>,"s":<student number>,"confidence":"medium"|"low","reason":"<one short sentence in Mongolian Cyrillic>"}]}
List only the transfers you can link.`;

const fmt = (n: number) => `${Math.round(n).toLocaleString("en-US")}₮`;

/**
 * `ok: false` means the AI could not be asked or its reply could not be read —
 * distinct from "asked, and it found nothing", which the caller records.
 */
export async function suggestMatches(
  transactions: BankTransaction[],
  roster: RosterEntry[]
): Promise<{ ok: boolean; suggestions: AiSuggestion[] }> {
  const none = { ok: false, suggestions: [] };
  if (!process.env.ANTHROPIC_API_KEY) return none;
  const txs = transactions.slice(0, AI_BATCH);
  const students = roster.filter((r) => r.status === "pending" || r.balance > 0).slice(0, MAX_STUDENTS);
  if (txs.length === 0 || students.length === 0) return { ok: true, suggestions: [] };

  const content =
    `Students (number. name | programme | still owed):\n` +
    students.map((s, i) => `${i + 1}. ${s.name} | ${s.programLabel} | ${fmt(s.balance)}`).join("\n") +
    `\n\nTransfers (number. date | amount | description):\n` +
    txs.map((t, i) => `${i + 1}. ${t.date} | ${fmt(t.amount)} | ${t.description}`).join("\n");

  let text: string;
  try {
    ({ text } = await claudeChat({ system: SYSTEM, messages: [{ role: "user", content }], tier: "smart", maxTokens: 4000 }));
  } catch (err) {
    console.error("[bank-statement] AI suggestion failed", err);
    return none;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return none;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return none;
  }
  const matches = (parsed as { matches?: unknown }).matches;
  if (!Array.isArray(matches)) return none;

  const out: AiSuggestion[] = [];
  const seen = new Set<number>();
  for (const m of matches as Record<string, unknown>[]) {
    const t = Number(m.t);
    const s = Number(m.s);
    if (!Number.isInteger(t) || !Number.isInteger(s) || seen.has(t)) continue;
    const tx = txs[t - 1];
    const student = students[s - 1];
    if (!tx || !student) continue;
    seen.add(t);
    out.push({
      transactionId: tx.id,
      registrationId: student.registrationId,
      confidence: m.confidence === "medium" ? "medium" : "low",
      reason: typeof m.reason === "string" ? m.reason.slice(0, 200) : "",
    });
  }
  return { ok: true, suggestions: out };
}
