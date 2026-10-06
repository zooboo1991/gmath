import { getSupabase } from "../supabase";
import { chunk, fetchAllRows } from "../fetchAll";
import { listAllRegistrations, listPaymentsForRegistrations, type Registration, type PublicUser } from "../db";
import { registrationBalance, sumPaymentsFor } from "../registration";
import { amountAfterCredit, installmentAmounts } from "../installment";
import { parsePriceToNumber } from "../price";
import { extractCourseCategories } from "../courseTag";
import { normalizePhone } from "./text";
import type { MatchContext, MatchRegistration, ScoredCandidate } from "./match";

export type BankTransactionStatus = "review" | "ready" | "approved" | "skipped";
export type MatchSource = "phone" | "name" | "qpay" | "intent" | "ai" | "admin" | "rule";

export type BankStatement = {
  id: string;
  fileName: string;
  filePath?: string;
  holder?: string;
  account?: string;
  periodFrom?: string;
  periodTo?: string;
  creditRows: number;
  newRows: number;
  rowCreditTotal: number;
  footerCreditTotal?: number;
  balanceGaps: number;
  uploadedBy?: string;
  createdAt: string;
};

export type BankTransaction = {
  id: string;
  statementId: string;
  occurredAt: string;
  /** Ulaanbaatar calendar date of the transfer — what a payment is recorded under. */
  date: string;
  amount: number;
  description: string;
  counterAccount: string;
  balanceAfter?: number;
  status: BankTransactionStatus;
  /** The linked registration — a confirmed link when ready/approved, a suggestion in review. */
  registrationId?: string;
  matchSource?: MatchSource;
  confidence?: "high" | "medium" | "low";
  reason?: string;
  candidates: ScoredCandidate[];
  paymentId?: string;
  approvedAt?: string;
  approvedBy?: string;
  createdAt: string;
};

/** One registration as the admin picks it in the matching screen. */
export type RosterEntry = {
  registrationId: string;
  name: string;
  phone: string;
  programLabel: string;
  status: "pending" | "active";
  balance: number;
};

type StatementRow = {
  id: string;
  file_name: string;
  file_path: string | null;
  holder: string | null;
  account: string | null;
  period_from: string | null;
  period_to: string | null;
  credit_rows: number;
  new_rows: number;
  row_credit_total: number | string;
  footer_credit_total: number | string | null;
  balance_gaps: number;
  uploaded_by: string | null;
  created_at: string;
};

type TransactionRow = {
  id: string;
  statement_id: string;
  dedupe_key: string;
  occurred_at: string;
  amount: number | string;
  description: string;
  counter_account: string;
  balance_after: number | string | null;
  status: BankTransactionStatus;
  registration_id: string | null;
  match_source: MatchSource | null;
  confidence: "high" | "medium" | "low" | null;
  reason: string | null;
  candidates: ScoredCandidate[] | null;
  payment_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

export function ubDate(iso: string): string {
  return new Date(Date.parse(iso) + UB_OFFSET_MS).toISOString().slice(0, 10);
}

function statementFromRow(row: StatementRow): BankStatement {
  return {
    id: row.id,
    fileName: row.file_name,
    filePath: row.file_path ?? undefined,
    holder: row.holder ?? undefined,
    account: row.account ?? undefined,
    periodFrom: row.period_from ?? undefined,
    periodTo: row.period_to ?? undefined,
    creditRows: row.credit_rows,
    newRows: row.new_rows,
    rowCreditTotal: Number(row.row_credit_total),
    footerCreditTotal: row.footer_credit_total === null ? undefined : Number(row.footer_credit_total),
    balanceGaps: row.balance_gaps,
    uploadedBy: row.uploaded_by ?? undefined,
    createdAt: row.created_at,
  };
}

function transactionFromRow(row: TransactionRow): BankTransaction {
  return {
    id: row.id,
    statementId: row.statement_id,
    occurredAt: row.occurred_at,
    date: ubDate(row.occurred_at),
    amount: Number(row.amount),
    description: row.description,
    counterAccount: row.counter_account,
    balanceAfter: row.balance_after === null ? undefined : Number(row.balance_after),
    status: row.status,
    registrationId: row.registration_id ?? undefined,
    matchSource: row.match_source ?? undefined,
    confidence: row.confidence ?? undefined,
    reason: row.reason ?? undefined,
    candidates: Array.isArray(row.candidates) ? row.candidates : [],
    paymentId: row.payment_id ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    createdAt: row.created_at,
  };
}

export async function createStatement(input: {
  fileName: string;
  filePath: string;
  holder?: string;
  account?: string;
  periodFrom?: string;
  periodTo?: string;
  creditRows: number;
  rowCreditTotal: number;
  footerCreditTotal: number | null;
  balanceGaps: number;
  uploadedBy?: string;
}): Promise<BankStatement> {
  const { data, error } = await getSupabase()
    .from("bank_statements")
    .insert({
      file_name: input.fileName,
      file_path: input.filePath,
      holder: input.holder ?? null,
      account: input.account ?? null,
      period_from: input.periodFrom ?? null,
      period_to: input.periodTo ?? null,
      credit_rows: input.creditRows,
      row_credit_total: input.rowCreditTotal,
      footer_credit_total: input.footerCreditTotal,
      balance_gaps: input.balanceGaps,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return statementFromRow(data as StatementRow);
}

export async function setStatementNewRows(id: string, newRows: number): Promise<void> {
  const { error } = await getSupabase().from("bank_statements").update({ new_rows: newRows }).eq("id", id);
  if (error) throw error;
}

/** Which of these rows an earlier, overlapping statement already brought in. */
export async function existingDedupeKeys(keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(keys, 100)) {
    const { data, error } = await getSupabase().from("bank_transactions").select("dedupe_key").in("dedupe_key", part);
    if (error) throw error;
    for (const row of (data ?? []) as { dedupe_key: string }[]) found.add(row.dedupe_key);
  }
  return found;
}

export type NewTransaction = {
  statementId: string;
  dedupeKey: string;
  occurredAt: string;
  amount: number;
  description: string;
  counterAccount: string;
  balanceAfter: number | null;
  status: BankTransactionStatus;
  registrationId: string | null;
  matchSource: MatchSource | null;
  confidence: "high" | "medium" | "low" | null;
  reason: string;
  candidates: ScoredCandidate[];
  /** For a transfer already booked (by hand or by QPay): that payment. */
  paymentId?: string | null;
};

/**
 * Inserts the rows, silently skipping any whose dedupe key is already stored —
 * two admins uploading overlapping statements at once cannot double a row.
 */
export async function insertTransactions(rows: NewTransaction[]): Promise<BankTransaction[]> {
  if (rows.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("bank_transactions")
    .upsert(
      rows.map((r) => ({
        statement_id: r.statementId,
        dedupe_key: r.dedupeKey,
        occurred_at: r.occurredAt,
        amount: r.amount,
        description: r.description,
        counter_account: r.counterAccount,
        balance_after: r.balanceAfter,
        status: r.status,
        registration_id: r.registrationId,
        match_source: r.matchSource,
        confidence: r.confidence,
        reason: r.reason,
        candidates: r.candidates,
        payment_id: r.paymentId ?? null,
      })),
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    )
    .select("*");
  if (error) throw error;
  return ((data ?? []) as TransactionRow[]).map(transactionFromRow);
}

/** Newest upload first. */
export async function listStatements(): Promise<BankStatement[]> {
  const rows = await fetchAllRows<StatementRow>(() =>
    getSupabase().from("bank_statements").select("*").order("created_at", { ascending: false }).order("id")
  );
  return rows.map(statementFromRow);
}

export async function findStatement(id: string): Promise<BankStatement | undefined> {
  const { data, error } = await getSupabase().from("bank_statements").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? statementFromRow(data as StatementRow) : undefined;
}

/** Newest transfer first. */
export async function listTransactions(filter: { statementId?: string } = {}): Promise<BankTransaction[]> {
  const rows = await fetchAllRows<TransactionRow>(() => {
    let q = getSupabase().from("bank_transactions").select("*");
    if (filter.statementId) q = q.eq("statement_id", filter.statementId);
    return q.order("occurred_at", { ascending: false }).order("id");
  });
  return rows.map(transactionFromRow);
}

export async function findTransactions(ids: string[]): Promise<BankTransaction[]> {
  const out: BankTransaction[] = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await getSupabase().from("bank_transactions").select("*").in("id", part);
    if (error) throw error;
    out.push(...((data ?? []) as TransactionRow[]).map(transactionFromRow));
  }
  return out;
}

/**
 * A guarded update: applies only while the row is in one of `fromStatuses`, so
 * two admins (or a double click) cannot both act on it. Returns undefined when
 * someone else got there first.
 */
export async function updateTransaction(
  id: string,
  patch: Partial<{
    status: BankTransactionStatus;
    registration_id: string | null;
    match_source: MatchSource | null;
    confidence: "high" | "medium" | "low" | null;
    reason: string | null;
    candidates: ScoredCandidate[];
    payment_id: string | null;
    approved_at: string | null;
    approved_by: string | null;
  }>,
  fromStatuses: BankTransactionStatus[],
  /** Also require the row to still point at this registration (approve's claim). */
  expectRegistrationId?: string
): Promise<BankTransaction | undefined> {
  let q = getSupabase().from("bank_transactions").update(patch).eq("id", id).in("status", fromStatuses);
  if (expectRegistrationId) q = q.eq("registration_id", expectRegistrationId);
  const { data, error } = await q.select("*").maybeSingle();
  if (error) throw error;
  return data ? transactionFromRow(data as TransactionRow) : undefined;
}

/** Which of these payments a bank row already accounts for. */
export async function linkedPaymentIds(paymentIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(paymentIds, 100)) {
    const { data, error } = await getSupabase().from("bank_transactions").select("payment_id").in("payment_id", part);
    if (error) throw error;
    for (const row of (data ?? []) as { payment_id: string }[]) found.add(row.payment_id);
  }
  return found;
}

function fullName(user: PublicUser | undefined, fallbackPhone?: string): string {
  const name = user ? `${user.lastName ?? ""} ${user.firstName ?? ""}`.trim() : "";
  return name || (fallbackPhone ? `(утсаар ${fallbackPhone})` : "(нэргүй)");
}

type IntentRow = { id: string; registration_id: string; amount: number; method: string; status: string };

/**
 * Everything the matcher needs, read once per upload: every live registration
 * (owing or not, for the picker), what each still owes, and the QPay ids the
 * statement's settlement lines point at.
 */
export async function loadMatchData(ownAccounts: string[] = []): Promise<{ ctx: MatchContext; roster: RosterEntry[] }> {
  const all = await listAllRegistrations();
  const live = all.filter(
    (r): r is Registration & { user?: PublicUser; status: "pending" | "active" } =>
      r.status !== "cancelled" && !r.user?.isTest
  );
  const payments = await listPaymentsForRegistrations(live.map((r) => r.id));
  const intents = await fetchAllRows<IntentRow>(() =>
    getSupabase().from("registration_payment_intents").select("id, registration_id, amount, method, status").order("id")
  );
  // Payments a bank row already accounts for, and money queued by ready rows
  // not yet approved. Not read leniently: without it every booked payment
  // would look free to explain a new transfer.
  const banked = await fetchAllRows<{ payment_id: string | null; registration_id: string | null; amount: number | string; status: string }>(
    () =>
      getSupabase()
        .from("bank_transactions")
        .select("payment_id, registration_id, amount, status")
        .or("payment_id.not.is.null,status.eq.ready")
        .order("id")
  );
  const linkedPayments = new Set(banked.map((b) => b.payment_id).filter((id): id is string => Boolean(id)));
  const allotted = new Map<string, number>();
  for (const b of banked) {
    if (b.status === "ready" && b.registration_id) {
      allotted.set(b.registration_id, (allotted.get(b.registration_id) ?? 0) + Number(b.amount));
    }
  }

  const roster: RosterEntry[] = [];
  const registrations: MatchRegistration[] = [];

  for (const r of live) {
    const paid = sumPaymentsFor(r.id, payments);
    const { balance } = registrationBalance(r, paid);
    roster.push({
      registrationId: r.id,
      name: fullName(r.user, r.phone),
      phone: r.user?.phone ?? r.phone ?? "",
      programLabel: r.programLabel,
      status: r.status,
      balance,
    });

    const full = r.totalDue ?? parsePriceToNumber(r.price);
    const credit = r.placementCredit ?? 0;
    const split = installmentAmounts(full, credit);
    registrations.push({
      registrationId: r.id,
      firstName: r.user?.firstName ?? "",
      lastName: r.user?.lastName ?? "",
      phones: [r.user?.phone, r.user?.parentPhone, r.phone].map(normalizePhone).filter(Boolean),
      programLabel: r.programLabel,
      categories: extractCourseCategories(r.programLabel),
      status: r.status,
      owing: r.status === "pending" || balance > 0,
      balance,
      // A pending row's first payment is half only on the split plan (the one
      // that sets a due date for the rest); otherwise it is the whole amount.
      expected:
        r.status === "pending"
          ? [r.installmentDueDate ? split.now : amountAfterCredit(full, credit)]
          : [balance, split.later].filter((n) => n > 0),
      payments: payments
        .filter((p) => p.registrationId === r.id)
        .map((p) => ({
          id: p.id,
          amount: p.amount,
          paidAt: p.paidAt,
          linked: linkedPayments.has(p.id),
        })),
      pendingBankIntents: intents
        .filter((i) => i.registration_id === r.id && i.method === "bank" && i.status === "pending")
        .map((i) => Number(i.amount)),
    });
  }

  const byHex = (hex: string) => all.filter((r) => r.id.replace(/-/g, "").startsWith(hex));
  const intentByHex = (hex: string) => intents.filter((i) => i.id.replace(/-/g, "").startsWith(hex));
  const label = (r: Registration & { user?: PublicUser }) => `${fullName(r.user, r.phone)}, ${r.programLabel}`;

  const ctx: MatchContext = {
    registrations,
    ownAccounts: new Set(ownAccounts),
    allotted,
    usedPayments: new Set(),
    qpay: (ref) => {
      if (ref.kind === "c") {
        const [r, other] = byHex(ref.hex);
        if (!r || other) return { state: "unknown" };
        return { state: r.status === "pending" ? "waiting" : "recorded", label: label(r), registrationId: r.id };
      }
      if (ref.kind === "i") {
        const [i, other] = intentByHex(ref.hex);
        if (!i || other) return { state: "unknown" };
        const r = all.find((x) => x.id === i.registration_id);
        return {
          state: i.status === "pending" ? "waiting" : "recorded",
          label: r ? label(r) : undefined,
          registrationId: i.registration_id,
        };
      }
      return { state: "unknown" };
    },
  };
  return { ctx, roster };
}
