/**
 * Stand-ins for every third party the app calls. Runs as a plain HTTP server
 * in the Vitest process; the network guard rewrites outbound requests to it
 * (and QPAY_BASE_URL points the QPay client straight here), so no test ever
 * reaches a live service.
 *
 * It is a separate process from the Next.js server under test, which rules
 * out `vi.mock` for anything the server does — hence a real server plus a
 * small control API (`/__mock/*`) that tests use to script responses and to
 * read back what was called.
 *
 * The QPay half deliberately reproduces two real constraints, because tests
 * depend on them being true: `sender_invoice_no` cannot be reused, and a paid
 * invoice cannot be cancelled.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type RecordedCall = {
  service: string;
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
};

type MockInvoice = {
  invoiceId: string;
  senderInvoiceNo: string;
  amount: number;
  description: string;
  callbackUrl: string;
  /** QPay reports payment rows only once the invoice has actually been paid. */
  paid: boolean;
  paymentId: string | null;
  cancelled: boolean;
  /** When set, /v2/payment/check answers with an error — QPay having a bad day. */
  failCheck: boolean;
};

/**
 * A Zoom meeting as the mock remembers it. Kept as state rather than answered
 * with a constant because rescheduling a lesson is supposed to edit the
 * meeting in place — a test can only tell the difference if the mock has a
 * "before" to change.
 */
export type MockZoomMeeting = {
  id: string;
  topic: string;
  startTime: string | null;
  duration: number | null;
  timezone: string | null;
};

const calls: RecordedCall[] = [];
const invoices = new Map<string, MockInvoice>();
const senderInvoiceNos = new Set<string>();
let invoiceCounter = 0;
const zoomMeetings = new Map<string, MockZoomMeeting>();
let zoomMeetingCounter = 0;

function record(service: string, req: IncomingMessage, url: URL, body: unknown) {
  calls.push({
    service,
    method: req.method ?? "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
  });
}

function json(res: ServerResponse, status: number, payload: unknown) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

function text(res: ServerResponse, status: number, payload: string) {
  res.writeHead(status, { "content-type": "text/plain" });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Which service a request is for. The guard tags rewritten requests with the
 * host they were meant for; QPay arrives untagged because QPAY_BASE_URL sends
 * it here directly, so its paths are recognised as a fallback.
 */
function serviceOf(req: IncomingMessage, url: URL): string {
  const tagged = req.headers["x-mock-origin-host"];
  if (typeof tagged === "string") {
    if (tagged === "merchant.qpay.mn") return "qpay";
    if (tagged === "web2sms.skytel.mn") return "skytel";
    if (tagged === "api.zoom.us" || tagged === "zoom.us") return "zoom";
    if (tagged === "graph.facebook.com") return "messenger";
    if (tagged === "api.anthropic.com") return "anthropic";
    if (tagged === "api.deepseek.com") return "deepseek";
    return tagged;
  }
  if (url.pathname.startsWith("/v2/auth/token")) return "qpay";
  if (url.pathname.startsWith("/v2/invoice")) return "qpay";
  if (url.pathname.startsWith("/v2/payment/check")) return "qpay";
  if (url.pathname.startsWith("/apiSend")) return "skytel";
  return "unknown";
}

function handleQpay(req: IncomingMessage, res: ServerResponse, url: URL, body: unknown) {
  const method = req.method ?? "GET";

  if (url.pathname === "/v2/auth/token") {
    return json(res, 200, { access_token: "mock-qpay-token", expires_in: 3600 });
  }

  if (url.pathname === "/v2/invoice" && method === "POST") {
    const input = (body ?? {}) as Record<string, unknown>;
    const senderInvoiceNo = String(input.sender_invoice_no ?? "");

    // QPay rejects a sender_invoice_no that has been used before, forever.
    // Reproduced here so the app's "never reuse one" rule is actually tested
    // rather than assumed.
    if (senderInvoiceNos.has(senderInvoiceNo)) {
      return json(res, 400, {
        error: "SENDER_INVOICE_NO_ALREADY_EXISTS",
        message: `sender_invoice_no ${senderInvoiceNo} already used`,
      });
    }
    senderInvoiceNos.add(senderInvoiceNo);

    invoiceCounter += 1;
    const invoiceId = `mock-invoice-${invoiceCounter}`;
    invoices.set(invoiceId, {
      invoiceId,
      senderInvoiceNo,
      amount: Number(input.amount ?? 0),
      description: String(input.invoice_description ?? ""),
      callbackUrl: String(input.callback_url ?? ""),
      paid: false,
      paymentId: null,
      cancelled: false,
      failCheck: false,
    });

    return json(res, 200, {
      invoice_id: invoiceId,
      qr_image: "bW9jay1xci1pbWFnZQ==",
      qPay_shortUrl: `https://s.qpay.mn/${invoiceId}`,
    });
  }

  if (url.pathname.startsWith("/v2/invoice/") && method === "DELETE") {
    const invoiceId = url.pathname.slice("/v2/invoice/".length);
    const invoice = invoices.get(invoiceId);
    if (!invoice) {
      return json(res, 422, { error: "INVOICE_NOTFOUND" });
    }
    // A paid invoice must not be torn down — the client relies on this
    // erroring rather than succeeding.
    if (invoice.paid) {
      return json(res, 400, { error: "INVOICE_PAID" });
    }
    if (invoice.cancelled) {
      return json(res, 400, { error: "INVOICE_ALREADY_CANCELED" });
    }
    invoice.cancelled = true;
    return json(res, 200, { ok: true });
  }

  if (url.pathname === "/v2/payment/check" && method === "POST") {
    const input = (body ?? {}) as Record<string, unknown>;
    const invoice = invoices.get(String(input.object_id ?? ""));
    if (invoice?.failCheck) {
      return json(res, 500, { error: "MOCK_QPAY_OUTAGE" });
    }
    // Unknown invoice or unpaid invoice: no rows, which is exactly what QPay
    // answers and what "not paid" means to the app.
    if (!invoice || !invoice.paid) {
      return json(res, 200, { count: 0, rows: [] });
    }
    return json(res, 200, {
      count: 1,
      rows: [
        {
          payment_id: invoice.paymentId,
          payment_status: "PAID",
          payment_amount: invoice.amount,
        },
      ],
    });
  }

  return json(res, 404, { error: "unhandled_qpay_path", path: url.pathname });
}

function handleControl(req: IncomingMessage, res: ServerResponse, url: URL, body: unknown) {
  const method = req.method ?? "GET";

  if (url.pathname === "/__mock/health") {
    return json(res, 200, { ok: true });
  }

  if (url.pathname === "/__mock/calls" && method === "GET") {
    const service = url.searchParams.get("service");
    return json(res, 200, { calls: service ? calls.filter((c) => c.service === service) : calls });
  }

  if (url.pathname === "/__mock/reset" && method === "POST") {
    calls.length = 0;
    // Invoices and used sender_invoice_no values survive a reset on purpose:
    // "this number was already used" is a property of the merchant account
    // for all time, and a test that relies on it must not be able to have it
    // cleared out from under it by an unrelated test's reset.
    return json(res, 200, { ok: true });
  }

  if (url.pathname === "/__mock/zoom/meetings" && method === "GET") {
    return json(res, 200, { meetings: [...zoomMeetings.values()] });
  }

  // "The admin deleted the meeting in Zoom while our row still points at it."
  // Everything about that meeting then answers 404, exactly as Zoom does.
  const forgetMatch = url.pathname.match(/^\/__mock\/zoom\/meetings\/([^/]+)$/);
  if (forgetMatch && method === "DELETE") {
    return json(res, 200, { forgotten: zoomMeetings.delete(forgetMatch[1]) });
  }

  if (url.pathname === "/__mock/qpay/invoices" && method === "GET") {
    return json(res, 200, { invoices: [...invoices.values()] });
  }

  // Marks an invoice paid, i.e. "the customer scanned the QR and paid".
  if (url.pathname === "/__mock/qpay/pay" && method === "POST") {
    const input = (body ?? {}) as Record<string, unknown>;
    const invoiceId = String(input.invoiceId ?? "");
    const invoice = invoices.get(invoiceId);
    if (!invoice) return json(res, 404, { ok: false, error: "unknown invoice" });
    invoice.paid = true;
    invoice.paymentId = String(input.paymentId ?? `mock-payment-${invoiceId}`);
    return json(res, 200, { ok: true, invoice });
  }

  // Makes QPay's own payment check fail for one invoice, so the app's
  // behaviour during a QPay outage can be tested.
  if (url.pathname === "/__mock/qpay/fail-check" && method === "POST") {
    const input = (body ?? {}) as Record<string, unknown>;
    const invoice = invoices.get(String(input.invoiceId ?? ""));
    if (!invoice) return json(res, 404, { ok: false, error: "unknown invoice" });
    invoice.failCheck = input.failCheck !== false;
    return json(res, 200, { ok: true, invoice });
  }

  // Finds the invoice created for a given sender_invoice_no — how a test goes
  // from "the registration I just made" to "the invoice QPay was asked for".
  if (url.pathname === "/__mock/qpay/find" && method === "GET") {
    const senderInvoiceNo = url.searchParams.get("senderInvoiceNo") ?? "";
    const found = [...invoices.values()].find((i) => i.senderInvoiceNo === senderInvoiceNo);
    return json(res, 200, { invoice: found ?? null });
  }

  return json(res, 404, { error: "unknown_control_path", path: url.pathname });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const body = await readBody(req);

  if (url.pathname.startsWith("/__mock/")) {
    return handleControl(req, res, url, body);
  }

  const service = serviceOf(req, url);
  record(service, req, url, body);

  switch (service) {
    case "qpay":
      return handleQpay(req, res, url, body);

    // Skytel answers a plain GET with a text body; the app only checks the
    // HTTP status.
    case "skytel":
      return text(res, 200, "SUCCESS");

    case "zoom": {
      const method = req.method ?? "GET";
      if (url.pathname.startsWith("/oauth/token")) {
        return json(res, 200, { access_token: "mock-zoom-token", expires_in: 3600 });
      }
      if (/^\/v2\/meetings\/[^/]+\/registrants$/.test(url.pathname)) {
        const id = `mock-registrant-${calls.length}`;
        return json(res, 201, {
          registrant_id: id,
          join_url: `https://zoom.us/w/mock?tk=${id}`,
        });
      }
      if (url.pathname === "/v2/users/me/meetings" && method === "POST") {
        const input = (body ?? {}) as Record<string, unknown>;
        zoomMeetingCounter += 1;
        const id = String(99000000000 + zoomMeetingCounter);
        zoomMeetings.set(id, {
          id,
          topic: String(input.topic ?? ""),
          startTime: input.start_time ? String(input.start_time) : null,
          duration: input.duration ? Number(input.duration) : null,
          timezone: input.timezone ? String(input.timezone) : null,
        });
        return json(res, 201, {
          id: Number(id),
          join_url: `https://zoom.us/j/${id}`,
          start_url: `https://zoom.us/s/${id}`,
        });
      }
      // A meeting's own resource: PATCH edits it in place (which is how a
      // rescheduled lesson keeps its join link), GET reads it back.
      const meetingMatch = url.pathname.match(/^\/v2\/meetings\/([^/]+)$/);
      if (meetingMatch) {
        const meeting = zoomMeetings.get(meetingMatch[1]);
        if (!meeting) return json(res, 404, { code: 3001, message: "Meeting does not exist" });
        if (method === "PATCH") {
          const input = (body ?? {}) as Record<string, unknown>;
          if (input.topic !== undefined) meeting.topic = String(input.topic);
          if (input.start_time !== undefined) meeting.startTime = String(input.start_time);
          if (input.duration !== undefined) meeting.duration = Number(input.duration);
          if (input.timezone !== undefined) meeting.timezone = String(input.timezone);
          // Zoom answers a successful update with 204 and no body.
          res.writeHead(204);
          res.end();
          return;
        }
        return json(res, 200, {
          id: Number(meeting.id),
          topic: meeting.topic,
          start_time: meeting.startTime,
          duration: meeting.duration,
          timezone: meeting.timezone,
        });
      }
      return json(res, 200, {});
    }

    case "anthropic":
      return json(res, 200, {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model: "mock-model",
        content: [{ type: "text", text: "Mock AI хариу." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

    case "deepseek":
      return json(res, 200, {
        choices: [{ message: { role: "assistant", content: "Mock AI хариу." } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

    case "messenger":
      return json(res, 200, { message_id: "mock-message-id", recipient_id: "mock-recipient" });

    default:
      return json(res, 501, { error: "no_mock_handler", service, path: url.pathname });
  }
}

export function startMockServer(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      json(res, 500, { error: String(err) });
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
