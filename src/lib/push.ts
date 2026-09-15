import webpush, { WebPushError } from "web-push";
import { getSupabase } from "./supabase";
import { chunk, fetchAllRows } from "./fetchAll";

/**
 * Web Push transport — piggybacks admin notifications onto whatever device
 * a student has subscribed from (see push_subscriptions in schema.sql).
 * Self-contained (queries Supabase directly, doesn't import db.ts) so
 * db.ts can import sendPushToUsers without a circular import — db.ts owns
 * the subscribe/unsubscribe CRUD the API routes use, this owns the
 * send-and-clean-up-after-itself loop.
 */

let vapidConfigured = false;

function configureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

type SubscriptionRow = { endpoint: string; p256dh: string; auth: string };

/**
 * Pushes to every device the given users have subscribed from. Best-effort:
 * a push failure never throws — the notification it's piggybacking on has
 * already succeeded by the time this runs. A 404/410 means the browser
 * itself revoked the subscription, so that row is deleted on the spot
 * rather than retried forever.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; url: string }
): Promise<void> {
  if (userIds.length === 0 || !configureVapid()) return;

  // Chunked and paged: the id list travels in the URL, and one family can have
  // several devices, so "every subscription of everyone we are notifying" is
  // not bounded by the number of people. A truncated list here loses pushes
  // silently — the send simply reaches fewer phones.
  const subscriptions: SubscriptionRow[] = [];
  try {
    for (const batch of chunk([...new Set(userIds)])) {
      const rows = await fetchAllRows<SubscriptionRow>(() =>
        getSupabase()
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .in("user_id", batch)
          .order("id")
      );
      subscriptions.push(...rows);
    }
  } catch (error) {
    console.error("[push] failed to load subscriptions:", error);
    return;
  }

  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body
      )
    )
  );

  const staleEndpoints: string[] = [];
  results.forEach((result, i) => {
    // Endpoint host only (e.g. "web.push.apple.com") — never log the full
    // endpoint/subscription secret.
    const host = new URL(subscriptions[i].endpoint).host;
    if (result.status === "fulfilled") {
      console.log(`[push] sent ok host=${host} statusCode=${result.value.statusCode} body=${result.value.body.slice(0, 200)}`);
    } else {
      const reason = result.reason;
      if (reason instanceof WebPushError && (reason.statusCode === 404 || reason.statusCode === 410)) {
        staleEndpoints.push(subscriptions[i].endpoint);
        console.log(`[push] stale, removing host=${host} statusCode=${reason.statusCode}`);
      } else if (reason instanceof WebPushError) {
        console.error(`[push] send failed host=${host} statusCode=${reason.statusCode} body=${reason.body?.slice(0, 300)}`);
      } else {
        console.error(`[push] send failed host=${host}:`, reason);
      }
    }
  });

  if (staleEndpoints.length > 0) {
    // Chunked like the read above: endpoint URLs are ~200 characters each and
    // travel in the request URL, so a mass revocation (a browser update, a key
    // rotation) would otherwise build one request too long to send — and the
    // dead rows would then be retried on every future broadcast forever.
    // 25, not chunk()'s default of 150: that default is sized for uuids, and a
    // push endpoint is a ~200-character URL, so 150 of them would build a
    // request line of about 30 KB — past what a server will accept, which
    // would leave the dead rows to be retried on every future broadcast.
    for (const batch of chunk(staleEndpoints, 25)) {
      const { error: deleteError } = await getSupabase()
        .from("push_subscriptions")
        .delete()
        .in("endpoint", batch);
      if (deleteError) console.error("[push] failed to clean up stale subscriptions:", deleteError);
    }
  }
}
