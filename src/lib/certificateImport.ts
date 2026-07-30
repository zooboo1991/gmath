import * as XLSX from "xlsx";
import { isTooLong, MAX_LEN } from "./validate";
import { toIsoDate } from "./courseDate";
import type { CertificateImportRow } from "./db";

type Field = keyof CertificateImportRow;

// Matched case-insensitively against the sheet's header row, so small
// wording variations in the admin's spreadsheet still work.
const HEADER_ALIASES: Record<Field, string[]> = {
  certificateNumber: ["сертификатын дугаар", "сертификат дугаар", "дугаар"],
  lastName: ["овог"],
  firstName: ["нэр"],
  category: ["сургалтын ангилал", "ангилал"],
  course: ["курс", "сургалт"],
  issuedDate: ["сургалтанд хамрагдсан огноо", "хамрагдсан огноо", "огноо"],
};

const FIELD_LABEL: Record<Field, string> = {
  certificateNumber: "Сертификатын дугаар",
  lastName: "Овог",
  firstName: "Нэр",
  category: "Сургалтын ангилал",
  course: "Курс",
  issuedDate: "Сургалтанд хамрагдсан огноо",
};

export type ParsedCertificates = {
  rows: CertificateImportRow[];
  /** Missing required columns — if non-empty, `rows`/`rowErrors` weren't attempted. */
  headerErrors: string[];
  rowErrors: { row: number; reason: string }[];
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Excel's own date cells (cellDates:true) arrive as JS Dates in local time. */
function excelDateToIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const iso = toIsoDate(trimmed);
    if (iso) return iso;
    const m = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
}

export function parseCertificateWorkbook(buffer: ArrayBuffer): ParsedCertificates {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const records = sheet ? (XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[]) : [];

  const fieldByHeader = new Map<string, Field>();
  for (const header of Object.keys(records[0] ?? {})) {
    const normalized = normalize(header);
    const match = (Object.entries(HEADER_ALIASES) as [Field, string[]][]).find(([, aliases]) =>
      aliases.includes(normalized)
    );
    if (match) fieldByHeader.set(header, match[0]);
  }

  const foundFields = new Set(fieldByHeader.values());
  const headerErrors = (Object.keys(HEADER_ALIASES) as Field[])
    .filter((f) => !foundFields.has(f))
    .map((f) => `Багана олдсонгүй: ${FIELD_LABEL[f]}`);
  if (headerErrors.length > 0) {
    return { rows: [], headerErrors, rowErrors: [] };
  }

  const headerOf = (field: Field) => [...fieldByHeader.entries()].find(([, f]) => f === field)![0];
  const numberHeader = headerOf("certificateNumber");
  const lastNameHeader = headerOf("lastName");
  const firstNameHeader = headerOf("firstName");
  const categoryHeader = headerOf("category");
  const courseHeader = headerOf("course");
  const dateHeader = headerOf("issuedDate");

  const rows: CertificateImportRow[] = [];
  const rowErrors: { row: number; reason: string }[] = [];

  records.forEach((record, i) => {
    const rowNumber = i + 2; // row 1 is the header
    const certificateNumber = String(record[numberHeader] ?? "").trim();
    const lastName = String(record[lastNameHeader] ?? "").trim();
    const firstName = String(record[firstNameHeader] ?? "").trim();
    const category = String(record[categoryHeader] ?? "").trim();
    const course = String(record[courseHeader] ?? "").trim();
    const issuedDate = excelDateToIso(record[dateHeader]);

    if (!certificateNumber && !lastName && !firstName && !category && !course) return; // blank row

    if (!certificateNumber) {
      rowErrors.push({ row: rowNumber, reason: "Сертификатын дугаар хоосон байна" });
      return;
    }
    if (isTooLong(certificateNumber, MAX_LEN.certificateNumber)) {
      rowErrors.push({ row: rowNumber, reason: "Сертификатын дугаар хэт урт байна" });
      return;
    }
    if (!lastName || !firstName) {
      rowErrors.push({ row: rowNumber, reason: "Овог, нэр хоослож болохгүй" });
      return;
    }
    if (isTooLong(lastName, MAX_LEN.name) || isTooLong(firstName, MAX_LEN.name)) {
      rowErrors.push({ row: rowNumber, reason: "Овог/нэр хэт урт байна" });
      return;
    }
    if (!category) {
      rowErrors.push({ row: rowNumber, reason: "Сургалтын ангилал хоосон байна" });
      return;
    }
    if (isTooLong(category, MAX_LEN.certificateCategory)) {
      rowErrors.push({ row: rowNumber, reason: "Ангилал хэт урт байна" });
      return;
    }
    if (!course) {
      rowErrors.push({ row: rowNumber, reason: "Курс хоосон байна" });
      return;
    }
    if (isTooLong(course, MAX_LEN.certificateCourse)) {
      rowErrors.push({ row: rowNumber, reason: "Курс хэт урт байна" });
      return;
    }
    if (!issuedDate) {
      rowErrors.push({ row: rowNumber, reason: "Огноог таньж чадсангүй" });
      return;
    }

    rows.push({ certificateNumber, lastName, firstName, category, course, issuedDate });
  });

  return { rows, headerErrors: [], rowErrors };
}
