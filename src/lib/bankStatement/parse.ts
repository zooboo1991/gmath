import * as XLSX from "xlsx";

/**
 * Reads a Khan Bank "Депозит дансны дэлгэрэнгүй хуулга" export (.xlsx).
 *
 * Layout: a few header lines (holder, IBAN, «Интервал: from-to»), a column
 * header row, one row per transaction, and a «Нийт дүн:» footer. Amounts are
 * text ("600000.00", debits negative), times are Ulaanbaatar wall-clock text
 * ("2026-09-30 19:34:24"). There is no transaction id column.
 *
 * Only incoming rows are returned in full; outgoing rows are counted and used
 * for the completeness check, never kept.
 */

export type StatementCredit = {
  /** As printed, Ulaanbaatar time: "2026-09-30 19:34:24". */
  localTime: string;
  /** The same instant as ISO with the +08:00 offset. */
  occurredAt: string;
  /** "YYYY-MM-DD" in Ulaanbaatar — the payment date to record. */
  date: string;
  amount: number;
  description: string;
  counterAccount: string;
  balanceAfter: number | null;
  /** Stable across overlapping uploads: "<local time>|<closing balance>". */
  dedupeKey: string;
};

export type ParsedStatement = {
  holder?: string;
  account?: string;
  periodFrom?: string;
  periodTo?: string;
  credits: StatementCredit[];
  debitRows: number;
  /**
   * Accounts the statement shows money being moved *out* to as «Орлого» — the
   * owner's own accounts. Money coming back from them is not tuition.
   */
  ownAccounts: string[];
  rowCreditTotal: number;
  footerCreditTotal: number | null;
  /** Consecutive rows whose closing balance is not the next row's opening balance. */
  balanceGaps: number;
};

export class StatementParseError extends Error {}

const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["гүйлгээний огноо", "огноо"],
  open: ["эхний үлдэгдэл"],
  credit: ["кредит гүйлгээ", "кредит"],
  debit: ["дебит гүйлгээ", "дебит"],
  close: ["эцсийн үлдэгдэл"],
  description: ["гүйлгээний утга", "утга"],
  account: ["харьцсан данс"],
};

function cellText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cellText(value).replace(/[\s,]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD HH:MM:SS" from a text cell or an Excel date serial. */
function toLocalTime(value: unknown): string | null {
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${d.y}-${pad(d.m)}-${pad(d.d)} ${pad(d.H)}:${pad(d.M)}:${pad(Math.floor(d.S))}`;
  }
  const m = cellText(value).match(/^(\d{4})[-./](\d{2})[-./](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
}

function findHeader(rows: unknown[][]): { index: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map((c) => cellText(c).toLowerCase());
    const cols: Record<string, number> = {};
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      const at = cells.findIndex((c) => aliases.includes(c));
      if (at >= 0) cols[key] = at;
    }
    if (cols.date !== undefined && cols.credit !== undefined && cols.description !== undefined) {
      return { index: i, cols };
    }
  }
  return null;
}

/** The first non-empty cell after the one whose text starts with `label`. */
function valueAfter(rows: unknown[][], label: string): string | undefined {
  for (const row of rows) {
    const at = row.findIndex((c) => cellText(c).toLowerCase().startsWith(label));
    if (at < 0) continue;
    const inline = cellText(row[at]).slice(label.length).replace(/^[:\s]+/, "");
    if (inline) return inline;
    const next = row.slice(at + 1).map(cellText).find(Boolean);
    if (next) return next;
  }
  return undefined;
}

export function parseKhanStatement(buffer: ArrayBuffer | Uint8Array): ParsedStatement {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), { type: "array" });
  } catch {
    throw new StatementParseError("Excel файлыг уншиж чадсангүй.");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new StatementParseError("Excel файлд хуудас алга.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  const header = findHeader(rows);
  if (!header) {
    throw new StatementParseError(
      "Хаан банкны хуулгын хүснэгт олдсонгүй — «Гүйлгээний огноо», «Кредит гүйлгээ», «Гүйлгээний утга» баганатай файл оруулна уу."
    );
  }
  const top = rows.slice(0, header.index);
  const interval = valueAfter(top, "интервал")?.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
  const { cols } = header;

  const credits: StatementCredit[] = [];
  const ownAccounts = new Set<string>();
  let debitRows = 0;
  let rowCreditTotal = 0;
  let footerCreditTotal: number | null = null;
  let balanceGaps = 0;
  let prevClose: number | null = null;

  for (const row of rows.slice(header.index + 1)) {
    const first = cellText(row[0]).toLowerCase();
    if (first.startsWith("нийт")) {
      footerCreditTotal = toNumber(row[cols.credit]);
      break;
    }
    const localTime = toLocalTime(row[cols.date]);
    if (!localTime) continue;

    const open = cols.open !== undefined ? toNumber(row[cols.open]) : null;
    const close = cols.close !== undefined ? toNumber(row[cols.close]) : null;
    if (prevClose !== null && open !== null && Math.abs(prevClose - open) > 0.005) balanceGaps++;
    if (close !== null) prevClose = close;

    const credit = toNumber(row[cols.credit]) ?? 0;
    const description = cellText(row[cols.description]);
    const counterAccount = cols.account !== undefined ? cellText(row[cols.account]) : "";

    if (credit > 0) {
      const amount = round2(credit);
      rowCreditTotal += amount;
      const balanceAfter = close === null ? null : round2(close);
      credits.push({
        localTime,
        occurredAt: `${localTime.replace(" ", "T")}+08:00`,
        date: localTime.slice(0, 10),
        amount,
        description,
        counterAccount,
        balanceAfter,
        dedupeKey:
          balanceAfter === null
            ? `${localTime}|${amount.toFixed(2)}|${description}|${counterAccount}`
            : `${localTime}|${balanceAfter.toFixed(2)}`,
      });
    } else {
      debitRows++;
      if (counterAccount && description.toLowerCase() === "орлого") ownAccounts.add(counterAccount);
    }
  }

  return {
    holder: valueAfter(top, "хэрэглэгч"),
    account: valueAfter(top, "iban"),
    periodFrom: interval?.[1],
    periodTo: interval?.[2],
    credits,
    debitRows,
    ownAccounts: [...ownAccounts],
    rowCreditTotal: round2(rowCreditTotal),
    footerCreditTotal: footerCreditTotal === null ? null : round2(footerCreditTotal),
    balanceGaps,
  };
}
