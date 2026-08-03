import { checkInvoicePayment, createInvoice, qpayConfigured } from "./qpay/client";

/**
 * Shared payment abstraction for both the assessment fee and course
 * enrollment. Neither flow settles synchronously in real life — QPay is an
 * invoice-and-callback flow — so `createPayment` returns either an
 * already-settled result (the stub, for dev) or a pending invoice with a QR
 * to show, and `checkPayment` re-confirms a pending one against QPay itself.
 */

export type PaymentStart =
  | { provider: string; paid: true; reference: string; paidAt: string }
  | { provider: string; paid: false; invoiceId: string; qrImage: string; shortUrl: string };

export type PaymentCheckResult = { paid: false } | { paid: true; reference: string; paidAt: string };

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: {
    amountMnt: number;
    description: string;
    /** Must be globally unique for this QPay merchant, forever — see createInvoice. */
    senderInvoiceNo: string;
    callbackUrl: string;
  }): Promise<PaymentStart>;
  checkPayment(invoiceId: string): Promise<PaymentCheckResult>;
}

/**
 * Settles instantly with no money changing hands. Recorded under provider
 * "stub" (never "qpay") so an unpaid-for-real assessment or registration
 * stays identifiable, and it refuses to run in production unless explicitly
 * switched on — see stubPaymentsEnabled.
 */
export class StubPaymentProvider implements PaymentProvider {
  readonly name = "stub";

  async createPayment(): Promise<PaymentStart> {
    return {
      provider: this.name,
      paid: true,
      reference: `stub-${crypto.randomUUID()}`,
      paidAt: new Date().toISOString(),
    };
  }

  // Never actually reached — createPayment already resolves paid — but the
  // interface requires it, and treating a stub invoice as paid on check too
  // keeps it a harmless no-op rather than a dead branch.
  async checkPayment(): Promise<PaymentCheckResult> {
    return { paid: true, reference: `stub-${crypto.randomUUID()}`, paidAt: new Date().toISOString() };
  }
}

const SETTLED_STATUSES = new Set(["PAID"]);

export class QPayPaymentProvider implements PaymentProvider {
  readonly name = "qpay";

  async createPayment(input: {
    amountMnt: number;
    description: string;
    senderInvoiceNo: string;
    callbackUrl: string;
  }): Promise<PaymentStart> {
    const invoice = await createInvoice({
      senderInvoiceNo: input.senderInvoiceNo,
      description: input.description,
      amount: input.amountMnt,
      callbackUrl: input.callbackUrl,
    });
    return {
      provider: this.name,
      paid: false,
      invoiceId: invoice.invoiceId,
      qrImage: invoice.qrImage,
      shortUrl: invoice.shortUrl,
    };
  }

  async checkPayment(invoiceId: string): Promise<PaymentCheckResult> {
    const rows = await checkInvoicePayment(invoiceId);
    const settled = rows.find((r) => SETTLED_STATUSES.has(r.status));
    if (!settled) return { paid: false };
    // QPay's check response carries no settlement timestamp of its own —
    // this records when *we* learned about it, which is what paidAt means
    // everywhere else it's used (audit trail, not a bank ledger).
    return { paid: true, reference: settled.paymentId, paidAt: new Date().toISOString() };
  }
}

/**
 * True when the stub is allowed to settle a payment. Off in production
 * unless ALLOW_STUB_PAYMENTS is set, so a QPay outage — or forgetting to set
 * the QPAY_* env vars on a new deployment — can't quietly hand out free
 * assessments or course registrations.
 */
export function stubPaymentsEnabled(): boolean {
  if (process.env.ALLOW_STUB_PAYMENTS === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export function getPaymentProvider(): PaymentProvider {
  return qpayConfigured() ? new QPayPaymentProvider() : new StubPaymentProvider();
}
