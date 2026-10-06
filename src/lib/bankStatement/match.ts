import {
  categoryHint,
  descriptionWords,
  looksLikeQpay,
  nameKey,
  phonesIn,
  qpayRefIn,
  withinEditDistance,
  type QpayRef,
} from "./text";

/**
 * Decides, for one incoming bank transfer, which student registration it pays
 * for — or that it pays for none.
 *
 * Only an unambiguous phone match is trusted enough to queue a payment on its
 * own ("ready"): the phone points at one owing registration, nothing in the
 * text points elsewhere, the amount fits what is still owed. A name, an AI
 * guess, an ambiguous phone or anything that might already be booked is a
 * suggestion the admin confirms ("review"). QPay settlements are never recorded
 * from here: the gateway books those itself.
 *
 * Pure apart from the per-upload ledger in the context (`allotted`,
 * `usedPayments`), which the caller shares across the rows of one upload so two
 * transfers cannot both claim the same balance or the same recorded payment.
 */

export type RecordedPayment = {
  id: string;
  amount: number;
  paidAt: string;
  /** Already tied to a bank transaction, so it explains no other transfer. */
  linked: boolean;
};

export type MatchRegistration = {
  registrationId: string;
  firstName: string;
  lastName: string;
  /** Student's, parent's and phone-only registration numbers, 8 digits. */
  phones: string[];
  programLabel: string;
  /** Programme letters ("C", "D") from the label; empty for groups without one. */
  categories: string[];
  status: "pending" | "active";
  /** Still owes something (or is waiting for its first payment). */
  owing: boolean;
  /** What is still owed (for a pending row: the whole amount due). */
  balance: number;
  /** Amounts a family would naturally send: the first instalment, the rest, the whole. */
  expected: number[];
  payments: RecordedPayment[];
  /** "I transferred X" declarations still waiting on the admin. */
  pendingBankIntents: number[];
};

/** What a truncated gmath QPay code in the description resolves to. */
export type QpayLookup = (ref: QpayRef) => {
  state: "recorded" | "waiting" | "unknown";
  label?: string;
  registrationId?: string;
};

export type MatchContext = {
  /** Every live (pending or active) registration, owing or not. */
  registrations: MatchRegistration[];
  ownAccounts: Set<string>;
  qpay: QpayLookup;
  /** Amount already queued per registration — earlier ready rows and this upload's. */
  allotted: Map<string, number>;
  /** Recorded payments already used to explain a transfer in this upload. */
  usedPayments: Set<string>;
};

export type MatchInput = { amount: number; date: string; description: string; counterAccount: string };

export type ScoredCandidate = { registrationId: string; score: number; reason: string };

export type MatchResult = {
  status: "review" | "ready" | "skipped";
  registrationId: string | null;
  source: "phone" | "name" | "qpay" | "intent" | "rule" | null;
  confidence: "high" | "medium" | "low" | null;
  reason: string;
  candidates: ScoredCandidate[];
  /** The recorded payment this transfer is (already booked by hand or by QPay) — stored so it explains no other transfer. */
  paymentId?: string;
};

const MIN_TUITION = 50_000;
const NOT_TUITION_RE = /зээл|цалин|илгээв|zeel|tsalin|ilgeev|худалдан авалт/i;
/** A recorded payment this close in time, for the same amount, is this transfer. */
const SAME_PAYMENT_DAYS = 2;
const MAYBE_SAME_PAYMENT_DAYS = 7;

const fmt = (n: number) => `${Math.round(n).toLocaleString("en-US")}₮`;

function skipped(reason: string, registrationId: string | null = null, paymentId?: string): MatchResult {
  return { status: "skipped", registrationId, source: "rule", confidence: null, reason, candidates: [], paymentId };
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/**
 * A recorded payment on this registration that may be this very transfer:
 * same amount, not tied to another bank row, not used by another row of this
 * upload. "sure" — dated within two days; "maybe" — within a week, or dated
 * after the transfer (a hand entry made later, whose date defaulted to "today").
 */
export function findTwin(
  payments: RecordedPayment[],
  amount: number,
  date: string,
  used: Set<string> = new Set()
): { payment: RecordedPayment; sure: boolean } | undefined {
  const open = payments.filter((p) => !p.linked && !used.has(p.id) && Math.abs(p.amount - amount) < 1);
  const sure = open.find((p) => daysBetween(p.paidAt, date) <= SAME_PAYMENT_DAYS);
  if (sure) return { payment: sure, sure: true };
  const maybe = open.find((p) => daysBetween(p.paidAt, date) <= MAYBE_SAME_PAYMENT_DAYS || p.paidAt >= date);
  return maybe ? { payment: maybe, sure: false } : undefined;
}

/**
 * How well a student's name shows up. The first name is looked for in what the
 * payer wrote, not in the bank's "ХААНААС: <code> <PAYER NAME>" tail — that is
 * a parent, whose first name is often some other child's.
 */
function nameScore(
  r: MatchRegistration,
  words: string[],
  allWords: string[]
): { score: number; exact: boolean; hit?: string } {
  const first = nameKey(r.firstName);
  const parts = r.firstName.split(/[-\s]+/).map(nameKey).filter((p) => p.length >= 3);
  const last = nameKey(r.lastName);
  let score = 0;
  let exact = true;
  if (first.length >= 3 && words.includes(first)) score = 4;
  else if (parts.length > 1 && (parts.every((p) => words.includes(p)) || words.includes(parts.join("")))) score = 3;
  else if (first.length >= 5 && words.some((w) => withinEditDistance(w, first, first.length >= 8 ? 2 : 1))) {
    score = 3;
    exact = false;
  }
  if (score === 0) return { score, exact: false };
  if (last.length >= 3 && allWords.includes(last)) score += 1.5;
  return { score, exact, hit: r.firstName };
}

type Scored = {
  r: MatchRegistration;
  phone: boolean;
  nameHit: boolean;
  /** The first name is written as such, not merely one letter off. */
  exactName: boolean;
  /** The part of the score that came from the programme letter alone. */
  category: number;
  total: number;
  reason: string;
};

function scoreOne(
  r: MatchRegistration,
  input: MatchInput,
  words: string[],
  allWords: string[],
  phones: string[],
  hint: string | null
): Scored {
  const reasons: string[] = [];
  let total = 0;
  let category = 0;
  const phone = r.phones.find((p) => phones.includes(p));
  if (phone) {
    total += 10;
    reasons.push(`утас ${phone}`);
  }
  const name = nameScore(r, words, allWords);
  if (name.score > 0) {
    total += name.score;
    reasons.push(`нэр «${name.hit}»`);
  }
  if (hint && r.categories.length > 0) {
    category = r.categories.includes(hint) ? 1.5 : -2;
    total += category;
    if (category > 0) reasons.push(`${hint} ангилал`);
  }
  if (r.owing && r.expected.some((e) => Math.abs(e - input.amount) < 1)) {
    total += 2;
    reasons.push("дүн таарч байна");
  } else if (input.amount > r.balance + 1) {
    total -= 3;
  }
  if (r.pendingBankIntents.some((a) => Math.abs(a - input.amount) < 1)) {
    total += 2;
    reasons.push("«дансаар шилжүүллээ» гэж мэдэгдсэн");
  }
  return {
    r,
    phone: Boolean(phone),
    nameHit: name.score > 0,
    exactName: name.exact,
    category,
    total,
    reason: reasons.join(", "),
  };
}

const who = (r: MatchRegistration) => `${r.lastName} ${r.firstName}`.trim() || "(нэргүй)";

function review(
  registrationId: string | null,
  source: MatchResult["source"],
  confidence: MatchResult["confidence"],
  reason: string,
  candidates: ScoredCandidate[]
): MatchResult {
  return { status: "review", registrationId, source, confidence, reason, candidates };
}

export function matchTransaction(input: MatchInput, ctx: MatchContext): MatchResult {
  const { description } = input;

  // QPay settlements are booked by the gateway, never from the statement.
  if (looksLikeQpay(description)) {
    const ref = qpayRefIn(description);
    if (ref && (ref.kind === "p" || ref.kind === "a")) return skipped("QPay — түвшин тогтоох төлбөр");
    const found = ref ? ctx.qpay(ref) : { state: "unknown" as const };
    if (found.state === "waiting") {
      return review(
        null,
        "qpay",
        null,
        `QPay-ээр төлсөн боловч систем бүртгээгүй${found.label ? ` — ${found.label}` : ""}. «Бүртгэл» хэсгээс «QPay шалгах» дарна уу.`,
        []
      );
    }
    // Tie the line to the payment the gateway booked (gross; the bank shows it
    // net of QPay's 1%), so a bank transfer of the same amount is not taken
    // for it later.
    const reg = found.registrationId ? ctx.registrations.find((r) => r.registrationId === found.registrationId) : undefined;
    const booked = reg?.payments.find(
      (p) =>
        !p.linked &&
        !ctx.usedPayments.has(p.id) &&
        (Math.abs(p.amount * 0.99 - input.amount) < 1 || Math.abs(p.amount - input.amount) < 1) &&
        daysBetween(p.paidAt, input.date) <= MAYBE_SAME_PAYMENT_DAYS
    );
    if (booked) ctx.usedPayments.add(booked.id);
    return skipped(
      found.label ? `QPay — системд бүртгэгдсэн (${found.label})` : "QPay — систем өөрөө бүртгэдэг",
      reg?.registrationId ?? null,
      booked?.id
    );
  }

  if (!Number.isInteger(input.amount)) return skipped("Бутархай дүн — сургалтын төлбөр биш бололтой");
  if (ctx.ownAccounts.has(input.counterAccount)) return skipped("Өөрийн данснаас шилжүүлсэн");
  if (NOT_TUITION_RE.test(description)) return skipped("Сургалтын төлбөр биш бололтой (зээл, цалин, шилжүүлэг)");
  if (input.amount < MIN_TUITION) return skipped(`Бага дүн (${fmt(input.amount)}) — сургалтын төлбөр биш бололтой`);

  const [written, payer = ""] = description.split(/хаанаас\s*:/i);
  const phones = phonesIn(description);
  const words = descriptionWords(written);
  const allWords = [...words, ...descriptionWords(payer)];
  const hint = categoryHint(written);

  const hits = ctx.registrations
    .map((r) => scoreOne(r, input, words, allWords, phones, hint))
    .filter((s) => s.phone || s.nameHit)
    .sort((a, b) => b.total - a.total);
  const toCandidates = (list: Scored[]): ScoredCandidate[] =>
    list.slice(0, 5).map((s) => ({ registrationId: s.r.registrationId, score: Math.round(s.total * 10) / 10, reason: s.reason }));

  /** Already booked by hand: skip when sure, otherwise leave it to the admin. */
  const twinCheck = (s: Scored, candidates: ScoredCandidate[]): MatchResult | null => {
    const twin = findTwin(s.r.payments, input.amount, input.date, ctx.usedPayments);
    if (!twin) return null;
    if (twin.sure) {
      ctx.usedPayments.add(twin.payment.id);
      return skipped(`Аль хэдийн бүртгэгдсэн — ${who(s.r)}, ${twin.payment.paidAt}`, s.r.registrationId, twin.payment.id);
    }
    return review(
      s.r.registrationId,
      s.phone ? "phone" : "name",
      "medium",
      `${s.reason}. Ижил дүн ${twin.payment.paidAt}-нд бүртгэгдсэн — давхар байж магадгүй`,
      candidates
    );
  };

  const byPhone = hits.filter((s) => s.phone);
  if (byPhone.length > 0) {
    const owing = byPhone.filter((s) => s.r.owing);
    const candidates = toCandidates([...owing, ...hits.filter((s) => !s.phone && s.nameHit)]);
    if (owing.length === 0) {
      // A known family with nothing owed: only a payment already booked for the
      // child it names (or the family's only registration) explains it. A
      // sibling's payment never does — that may be this child's duplicate.
      const named = byPhone.filter((s) => s.nameHit);
      const own = named.length > 0 ? named : byPhone.length === 1 ? byPhone : [];
      for (const s of own) {
        const twin = findTwin(s.r.payments, input.amount, input.date, ctx.usedPayments);
        if (twin?.sure) {
          ctx.usedPayments.add(twin.payment.id);
          return skipped(`Аль хэдийн бүртгэгдсэн — ${who(s.r)}, ${twin.payment.paidAt}`, s.r.registrationId, twin.payment.id);
        }
      }
      return review(null, null, null, `Утас нь ${who(byPhone[0].r)}-ийнх, гэхдээ үлдэгдэлтэй бүртгэл алга`, toCandidates(byPhone));
    }

    // Decide on everything but the programme letter: a letter alone must not
    // choose between a family's registrations.
    const plain = (s: Scored) => s.total - s.category;
    const best = [...owing].sort((a, b) => plain(b) - plain(a))[0];
    const r = best.r;
    const twin = twinCheck(best, candidates);
    if (twin) return twin;
    const rivals = owing.filter((s) => s !== best && plain(best) - plain(s) < 1);
    if (rivals.length > 0) {
      return review(r.registrationId, "phone", "medium", `Утас таарсан ${owing.length} бүртгэл байна — аль нэгийг нь сонгоно уу`, candidates);
    }
    // The same amount booked on a sibling may be this very transfer — unless
    // the text names this child, which makes it this child's own payment.
    for (const s of best.exactName ? [] : byPhone) {
      if (s === best) continue;
      const sib = findTwin(s.r.payments, input.amount, input.date, ctx.usedPayments);
      if (sib) {
        return review(
          r.registrationId,
          "phone",
          "medium",
          `${best.reason}. Ах дүү ${who(s.r)}-д ижил дүн ${sib.payment.paidAt}-нд бүртгэгдсэн — давхар эсэхийг шалгана уу`,
          candidates
        );
      }
    }
    const otherNamed = hits.find((s) => s.exactName && s.r.registrationId !== r.registrationId);
    if (otherNamed && !best.exactName) {
      return review(
        r.registrationId,
        "phone",
        "medium",
        `Утсаар ${who(r)}, харин утганд ${who(otherNamed.r)}-ийн нэр бичигдсэн — шалгана уу`,
        candidates
      );
    }
    if (best.category < 0) {
      return review(r.registrationId, "phone", "medium", `${best.reason}. Утганд ${hint} ангилал гэсэн нь таарахгүй байна`, candidates);
    }
    if (r.status === "pending" && input.amount + 1 < Math.min(...r.expected)) {
      return review(
        r.registrationId,
        "phone",
        "medium",
        `${best.reason}. Эхний төлбөрөөс (${fmt(Math.min(...r.expected))}) бага — идэвхжүүлэх эсэхээ шийднэ үү`,
        candidates
      );
    }
    const left = r.balance - (ctx.allotted.get(r.registrationId) ?? 0);
    if (input.amount > left + 1) {
      return review(
        r.registrationId,
        "phone",
        "medium",
        `${best.reason}. Дүн үлдэгдлээс (${fmt(Math.max(0, left))}) их — шалгана уу`,
        candidates
      );
    }
    ctx.allotted.set(r.registrationId, (ctx.allotted.get(r.registrationId) ?? 0) + input.amount);
    return {
      status: "ready",
      registrationId: r.registrationId,
      source: "phone",
      confidence: owing.length === 1 ? "high" : "medium",
      reason: best.reason,
      candidates,
    };
  }

  if (hits.length === 0) return review(null, null, null, "Хэний төлбөр болох нь тодорхойгүй", []);

  // Name only: never "ready". A booked twin counts only for a clear winner — a
  // same-name stranger's payment must not hide this transfer.
  const [top, runnerUp] = hits;
  const clearTop = !runnerUp || top.total - runnerUp.total >= 1.5;
  if (clearTop) {
    const twin = twinCheck(top, toCandidates(hits));
    if (twin) return twin;
  }
  const owing = hits.filter((s) => s.r.owing);
  if (owing.length === 0) {
    return review(null, null, null, "Нэр төстэй сурагчид үлдэгдэлгүй байна — шалгана уу", toCandidates(hits));
  }
  const [best, second] = owing;
  const clear = !second || best.total - second.total >= 1.5;
  const tooMuch = input.amount > best.r.balance - (ctx.allotted.get(best.r.registrationId) ?? 0) + 1;
  return review(
    clear ? best.r.registrationId : null,
    "name",
    clear && best.total >= 5 && !tooMuch ? "medium" : "low",
    clear
      ? `Магадгүй ${who(best.r)} (${best.r.programLabel}): ${best.reason}` + (tooMuch ? `. Дүн үлдэгдлээс их` : "")
      : `Нэр төстэй ${owing.length} сурагч байна — сонгоно уу`,
    toCandidates(owing)
  );
}
