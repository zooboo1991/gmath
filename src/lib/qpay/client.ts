/**
 * Thin wrapper over the QPay v2 merchant API (https://merchant.qpay.mn).
 * Credentials come from environment variables only — QPAY_USERNAME,
 * QPAY_PASSWORD, QPAY_INVOICE_CODE — never from source. See
 * src/lib/payment.ts for the higher-level provider that calls this.
 */

function required(name: "QPAY_USERNAME" | "QPAY_PASSWORD" | "QPAY_INVOICE_CODE"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} орчны хувьсагч тохируулаагүй байна`);
  return value;
}

function baseUrl(): string {
  return process.env.QPAY_BASE_URL || "https://merchant.qpay.mn";
}

export function qpayConfigured(): boolean {
  return Boolean(process.env.QPAY_USERNAME && process.env.QPAY_PASSWORD && process.env.QPAY_INVOICE_CODE);
}

type TokenCache = { accessToken: string; expiresAtMs: number };
let tokenCache: TokenCache | null = null;

/**
 * QPay warns against fetching a fresh token on every request — the access
 * token stays valid for a long time and should be reused for that whole
 * span. Cached per warm server instance; a cold start just fetches again.
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs - 60_000 > now) {
    return tokenCache.accessToken;
  }

  const basic = Buffer.from(`${required("QPAY_USERNAME")}:${required("QPAY_PASSWORD")}`).toString("base64");
  const res = await fetch(`${baseUrl()}/v2/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    throw new Error(`QPay нэвтрэхэд алдаа гарлаа: ${res.status}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };

  // QPay's own docs call expires_in a duration in seconds, but example
  // responses return an absolute unix timestamp instead. A duration this
  // large would mean caching a token as fresh for centuries, so treat
  // anything past ~120 days as a timestamp rather than trust the label.
  const asDurationMs = json.expires_in * 1000;
  const expiresAtMs = asDurationMs > 1000 * 60 * 60 * 24 * 120 ? json.expires_in * 1000 : now + asDurationMs;

  tokenCache = { accessToken: json.access_token, expiresAtMs };
  return tokenCache.accessToken;
}

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
}

async function errorDetail(res: Response): Promise<string> {
  return res
    .text()
    .then((t) => t.slice(0, 300))
    .catch(() => "");
}

export type QPayInvoice = {
  invoiceId: string;
  /** Base64 PNG, no "data:" prefix. */
  qrImage: string;
  shortUrl: string;
};

export async function createInvoice(input: {
  senderInvoiceNo: string;
  description: string;
  amount: number;
  callbackUrl: string;
}): Promise<QPayInvoice> {
  const res = await authedFetch("/v2/invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invoice_code: required("QPAY_INVOICE_CODE"),
      sender_invoice_no: input.senderInvoiceNo,
      // "terminal" is QPay's receiver code for one-off consumer invoices
      // (the "create simple" shape) — there is no pre-registered QPay
      // customer code for a parent paying for a course.
      invoice_receiver_code: "terminal",
      invoice_description: input.description,
      amount: input.amount,
      callback_url: input.callbackUrl,
    }),
  });
  if (!res.ok) {
    throw new Error(`QPay нэхэмжлэл үүсгэхэд алдаа гарлаа: ${res.status} ${await errorDetail(res)}`);
  }
  const json = (await res.json()) as { invoice_id: string; qr_image: string; qPay_shortUrl: string };
  return { invoiceId: json.invoice_id, qrImage: json.qr_image, shortUrl: json.qPay_shortUrl };
}

/**
 * Voids an invoice a student abandoned so its QR/short link can no longer be
 * paid — otherwise a stale QR scanned later would move real money against a
 * registration/assessment our side has already deleted. A 404 (already
 * gone) and QPay's own INVOICE_ALREADY_CANCELED are both treated as
 * success; anything else — most importantly INVOICE_PAID — is left for the
 * caller to handle, since that means the student paid after all and the
 * invoice must not be torn down.
 */
export async function cancelInvoice(invoiceId: string): Promise<void> {
  const res = await authedFetch(`/v2/invoice/${invoiceId}`, { method: "DELETE" });
  if (res.ok || res.status === 404) return;
  const detail = await errorDetail(res);
  // Both mean the same thing for our purposes: there is no live invoice left
  // that could take money, which is exactly what the caller wanted. QPay
  // answers a missing invoice with 422 INVOICE_NOTFOUND rather than a 404 —
  // observed, not documented. Treating it as an error stranded rows nobody
  // could then delete.
  if (detail.includes("INVOICE_ALREADY_CANCELED") || detail.includes("INVOICE_NOTFOUND")) return;
  // Everything else still throws — most importantly INVOICE_PAID, where the
  // customer paid after all and the invoice must not be torn down.
  throw new Error(`QPay нэхэмжлэл цуцлахад алдаа гарлаа: ${res.status} ${detail}`);
}

export type QPayPaymentRow = {
  paymentId: string;
  status: string;
  amount: number;
};

/**
 * Authoritative payment status for an invoice. Always call this to confirm
 * a payment — the callback only tells you *when* to check, never trust its
 * query string as proof something was paid. Do not call this on a timer;
 * QPay explicitly forbids polling it from a cron job.
 */
export async function checkInvoicePayment(invoiceId: string): Promise<QPayPaymentRow[]> {
  const res = await authedFetch("/v2/payment/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "INVOICE",
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  });
  if (!res.ok) {
    throw new Error(`QPay төлбөр шалгахад алдаа гарлаа: ${res.status} ${await errorDetail(res)}`);
  }
  const json = (await res.json()) as {
    rows?: Array<{ payment_id: string; payment_status: string; payment_amount: number | string }>;
  };
  return (json.rows ?? []).map((r) => ({
    paymentId: String(r.payment_id),
    status: r.payment_status,
    amount: Number(r.payment_amount),
  }));
}
