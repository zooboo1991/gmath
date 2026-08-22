/**
 * Test-side handle on the mock server: script a payment, read back what was
 * called. Everything here goes over HTTP because the mock is shared with the
 * Next.js server, which is a different process.
 */

import { readFileSync, existsSync } from "node:fs";
import { MOCK_BASE, NETWORK_JOURNAL } from "./env";
import type { MockZoomMeeting, RecordedCall } from "./mockServer";

export type MockInvoice = {
  invoiceId: string;
  senderInvoiceNo: string;
  amount: number;
  description: string;
  callbackUrl: string;
  paid: boolean;
  paymentId: string | null;
  cancelled: boolean;
};

async function control<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MOCK_BASE}${path}`, init);
  if (!res.ok) throw new Error(`mock control ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

/** Forgets recorded calls. Invoices and used sender_invoice_no values persist by design. */
export async function resetMockCalls(): Promise<void> {
  await control("/__mock/reset", { method: "POST" });
}

export async function mockCalls(service?: string): Promise<RecordedCall[]> {
  const query = service ? `?service=${encodeURIComponent(service)}` : "";
  const { calls } = await control<{ calls: RecordedCall[] }>(`/__mock/calls${query}`);
  return calls;
}

/** Every Zoom meeting the mock has been asked to create, with its current time. */
export async function listMockZoomMeetings(): Promise<MockZoomMeeting[]> {
  const { meetings } = await control<{ meetings: MockZoomMeeting[] }>("/__mock/zoom/meetings");
  return meetings;
}

export async function findMockZoomMeeting(id: string): Promise<MockZoomMeeting | null> {
  return (await listMockZoomMeetings()).find((m) => m.id === id) ?? null;
}

export async function listMockInvoices(): Promise<MockInvoice[]> {
  const { invoices } = await control<{ invoices: MockInvoice[] }>("/__mock/qpay/invoices");
  return invoices;
}

export async function findMockInvoice(senderInvoiceNo: string): Promise<MockInvoice | null> {
  const { invoice } = await control<{ invoice: MockInvoice | null }>(
    `/__mock/qpay/find?senderInvoiceNo=${encodeURIComponent(senderInvoiceNo)}`
  );
  return invoice;
}

/** "The customer scanned the QR and paid." */
export async function payMockInvoice(invoiceId: string, paymentId?: string): Promise<MockInvoice> {
  const { invoice } = await control<{ invoice: MockInvoice }>("/__mock/qpay/pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ invoiceId, paymentId }),
  });
  return invoice;
}

/** Makes QPay's payment check fail for one invoice — a QPay outage, on demand. */
export async function failMockInvoiceCheck(invoiceId: string, failCheck = true): Promise<void> {
  await control("/__mock/qpay/fail-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ invoiceId, failCheck }),
  });
}

/** The invoice id a registration's sender_invoice_no maps to — see enroll/route.ts. */
export function senderInvoiceNoForRegistration(registrationId: string): string {
  return `gm-c-${registrationId.replace(/-/g, "")}`;
}

export function senderInvoiceNoForAssessment(assessmentId: string): string {
  return `gm-a-${assessmentId.replace(/-/g, "")}`;
}

export type JournalEntry = {
  at: string;
  kind: "guard-installed" | "intercepted" | "blocked";
  host?: string;
  url?: string;
  method?: string;
};

/** Everything the network guard saw, across both processes. */
export function readNetworkJournal(): JournalEntry[] {
  if (!existsSync(NETWORK_JOURNAL)) return [];
  return readFileSync(NETWORK_JOURNAL, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry);
}
