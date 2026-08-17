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
 * A Bunny Stream video zone: `vz-<hash>.b-cdn.net`, the host every asset link
 * in the dashboard's "Video and asset links" list points at — HLS playlist,
 * thumbnail, preview animation. They all carry the video's GUID in the first
 * path segment.
 *
 * The `vz-` prefix is what keeps this narrow. A plain Bunny *storage* zone is
 * also a `b-cdn.net` host, and a teacher pasting an mp4 from one of those means
 * "play this file", not "this is a Stream video".
 */
const VIDEO_ZONE_RE = /\bvz-[a-z0-9-]+\.b-cdn\.net/i;

/**
 * Pulls a video GUID out of whatever the teacher pasted: a bare GUID, a player
 * URL, any of the asset links from the video's page, or a whole `<iframe …>`
 * block copied from the dashboard. Returns null for anything that isn't a Bunny
 * video — a Drive or YouTube link included, which is how the caller decides
 * whether to render the embedded player.
 *
 * The asset links matter because they are what the dashboard offers first: a
 * pasted thumbnail URL used to be filed as an external link, so the lesson
 * opened a new tab onto a token-protected image and answered 403.
 */
export function parseBunnyVideoId(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  // A bare GUID is the whole value, not just a substring of some other URL.
  if (new RegExp(`^${GUID_RE.source}$`, "i").test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Otherwise it must look like a Bunny link before a GUID inside it means
  // anything — a Drive URL can contain hex that resembles one.
  if (!/mediadelivery\.net/i.test(trimmed) && !VIDEO_ZONE_RE.test(trimmed)) return null;
  const match = trimmed.match(GUID_RE);
  return match ? match[0].toLowerCase() : null;
}
