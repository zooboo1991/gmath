/**
 * Thin wrapper over the Zoom REST API (https://api.zoom.us/v2), authenticated
 * via a Server-to-Server OAuth app — the only app type Zoom still supports
 * for this (JWT apps were fully retired). Credentials come from environment
 * variables only — ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET —
 * never from source.
 */

function required(name: "ZOOM_ACCOUNT_ID" | "ZOOM_CLIENT_ID" | "ZOOM_CLIENT_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} орчны хувьсагч тохируулаагүй байна`);
  return value;
}

export function zoomConfigured(): boolean {
  return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

const API_BASE = "https://api.zoom.us/v2";

type TokenCache = { accessToken: string; expiresAtMs: number };
let tokenCache: TokenCache | null = null;

/**
 * Server-to-Server OAuth token — unlike a user-consent OAuth flow, this is
 * account-credentials grant, minted fresh from the client id/secret each
 * time the cache goes stale. Zoom's tokens last 1 hour; cached per warm
 * server instance, with a minute of safety margin before expiry.
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs - 60_000 > now) {
    return tokenCache.accessToken;
  }

  const basic = Buffer.from(`${required("ZOOM_CLIENT_ID")}:${required("ZOOM_CLIENT_SECRET")}`).toString(
    "base64"
  );
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
      required("ZOOM_ACCOUNT_ID")
    )}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Zoom нэвтрэхэд алдаа гарлаа: ${res.status} ${await errorDetail(res)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { accessToken: json.access_token, expiresAtMs: now + json.expires_in * 1000 };
  return tokenCache.accessToken;
}

export async function zoomFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

export async function errorDetail(res: Response): Promise<string> {
  return res
    .text()
    .then((t) => t.slice(0, 300))
    .catch(() => "");
}

export type ZoomMeeting = {
  id: string;
  joinUrl: string;
  startUrl: string;
};

/**
 * A scheduled meeting with registration turned on and auto-approval, so a
 * student registering gets a working personal join_url back immediately —
 * no one has to click "approve" in the Zoom dashboard for class to start.
 */
export async function createMeeting(topic: string): Promise<ZoomMeeting> {
  const res = await zoomFetch("/users/me/meetings", {
    method: "POST",
    body: JSON.stringify({
      topic,
      type: 2,
      settings: {
        approval_type: 0,
        registration_type: 1,
        join_before_host: true,
        waiting_room: false,
        registrants_email_notification: false,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Zoom meeting үүсгэхэд алдаа гарлаа: ${res.status} ${await errorDetail(res)}`);
  }
  const json = (await res.json()) as { id: number; join_url: string; start_url: string };
  return { id: String(json.id), joinUrl: json.join_url, startUrl: json.start_url };
}

export type ZoomRegistrant = {
  registrantId: string;
  joinUrl: string;
};

/**
 * Registers one student for a meeting and hands back their personal join
 * link — this, not the meeting's shared join_url, is what a student should
 * actually be given, since it's what lets the webhook's participant events
 * be attributed back to a specific registrant_id later.
 */
export async function addRegistrant(
  meetingId: string,
  input: { email: string; firstName: string; lastName: string }
): Promise<ZoomRegistrant> {
  const res = await zoomFetch(`/meetings/${meetingId}/registrants`, {
    method: "POST",
    body: JSON.stringify({ email: input.email, first_name: input.firstName, last_name: input.lastName }),
  });
  if (!res.ok) {
    throw new Error(`Zoom-д бүртгэхэд алдаа гарлаа: ${res.status} ${await errorDetail(res)}`);
  }
  const json = (await res.json()) as { registrant_id: string; join_url: string };
  return { registrantId: json.registrant_id, joinUrl: json.join_url };
}
