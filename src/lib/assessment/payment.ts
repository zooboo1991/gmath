/**
 * Payment abstraction for the assessment fee.
 *
 * TODO(QPay): once the merchant contract is signed, add a QPayProvider here
 * implementing the same interface — create an invoice, return its QR/deeplink,
 * and confirm only from QPay's server-to-server callback. Nothing outside this
 * file should need to change. Credentials must come from environment
 * variables (QPAY_CLIENT_ID / QPAY_CLIENT_SECRET), never from source.
 *
 * Until then the stub below is the only provider. It is intentionally NOT the
 * same shape as the course-enrollment flow, where picking "QPay" marks a
 * registration active without any money changing hands — here a stub payment
 * is recorded as provider "stub" so unpaid assessments stay identifiable, and
 * it refuses to run in production unless explicitly switched on.
 */

export type PaymentIntent = {
  provider: string;
  /** Provider-side transaction id. For the stub, a locally generated marker. */
  reference: string;
  amount: string;
  paidAt: string;
};

export interface PaymentProvider {
  readonly name: string;
  /** Resolves once the fee is settled; throws if it could not be taken. */
  charge(amount: string): Promise<PaymentIntent>;
}

export class StubPaymentProvider implements PaymentProvider {
  readonly name = "stub";

  async charge(amount: string): Promise<PaymentIntent> {
    return {
      provider: this.name,
      reference: `stub-${crypto.randomUUID()}`,
      amount,
      paidAt: new Date().toISOString(),
    };
  }
}

/**
 * True when the stub is allowed to settle a payment. Off in production unless
 * ALLOW_STUB_PAYMENTS is set, so shipping before QPay lands can't quietly hand
 * out free assessments.
 */
export function stubPaymentsEnabled(): boolean {
  if (process.env.ALLOW_STUB_PAYMENTS === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export function getPaymentProvider(): PaymentProvider {
  // Only one provider for now; the switch lands with QPay.
  return new StubPaymentProvider();
}
