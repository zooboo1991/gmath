/**
 * Recognising a Bunny Stream video — the half of the Bunny code that has to run
 * in the browser too.
 *
 * Signing needs node's `crypto` and the secret token key, so it can only live
 * on the server; but the lesson editor also has to tell the teacher whether the
 * link they pasted will play in-page or open in a new tab, and that is the same
 * rule. Keeping the rule in a module with no node imports is what lets both
 * sides share one definition instead of drifting apart — the split is the same
 * one `adminSections.ts` (client) and `adminAccess.ts` (server) use.
 */

/** 8-4-4-4-12 hex, the shape of a Bunny video GUID. */
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Pulls a video GUID out of whatever the teacher pasted: a bare GUID, a player
 * URL, or a whole `<iframe …>` block copied from the dashboard. Returns null
 * for anything that isn't a Bunny video — a Drive or YouTube link included,
 * which is how the caller decides whether to render the embedded player.
 */
export function parseBunnyVideoId(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  // A bare GUID is the whole value, not just a substring of some other URL.
  if (new RegExp(`^${GUID_RE.source}$`, "i").test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Otherwise it must look like a Bunny player link before a GUID inside it
  // means anything — a Drive URL can contain hex that resembles one.
  if (!/mediadelivery\.net/i.test(trimmed)) return null;
  const match = trimmed.match(GUID_RE);
  return match ? match[0].toLowerCase() : null;
}
