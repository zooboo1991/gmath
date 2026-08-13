import { createHash } from "crypto";

/**
 * Bunny Stream playback links.
 *
 * The teacher uploads a recording in Bunny's dashboard and pastes the video's
 * GUID (or the whole embed URL) into the lesson row. Nothing about that changes
 * the database: `lessons[].recordingLink` already exists and still accepts an
 * ordinary link, so recordings that live on Drive or YouTube keep working
 * exactly as before — only a recognised Bunny video gets the in-page player.
 *
 * Playback is protected in two layers:
 *   1. The API route only mints a URL for a student with an *active*
 *      registration for that course.
 *   2. The URL itself is signed and expires, so a link copied out of devtools
 *      stops working within hours rather than being shareable forever.
 * Both matter: without (1) anyone could ask for any video, and without (2) one
 * paying student could hand the link to a group chat.
 */

/** 8-4-4-4-12 hex, the shape of a Bunny video GUID. */
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function bunnyConfigured(): boolean {
  return Boolean(process.env.BUNNY_STREAM_LIBRARY_ID && process.env.BUNNY_STREAM_TOKEN_KEY);
}

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
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Otherwise it must look like a Bunny player link before a GUID inside it
  // means anything — a Drive URL can contain hex that resembles one.
  if (!/mediadelivery\.net/i.test(trimmed)) return null;
  const match = trimmed.match(GUID_RE);
  return match ? match[0].toLowerCase() : null;
}

/** Default lifetime of a playback URL. Long enough to watch a lesson twice, short enough that a leaked link dies the same day. */
const DEFAULT_TTL_SECONDS = 3 * 60 * 60;

/**
 * Signs an embed URL for one video.
 *
 * Bunny's embed-view token is `SHA256_HEX(tokenKey + videoId + expires)` with
 * `expires` a unix timestamp in **seconds** — milliseconds are rejected.
 *
 * The host is configurable because Bunny is mid-migration between the legacy
 * `iframe.mediadelivery.net` and the current `player.mediadelivery.net`; if a
 * library only answers on the old one, that's an env change, not a deploy.
 */
export function signBunnyEmbedUrl(videoId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const tokenKey = process.env.BUNNY_STREAM_TOKEN_KEY;
  if (!libraryId || !tokenKey) {
    throw new Error("BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_TOKEN_KEY тохируулаагүй байна");
  }

  const host = process.env.BUNNY_STREAM_EMBED_HOST || "player.mediadelivery.net";
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = createHash("sha256").update(`${tokenKey}${videoId}${expires}`).digest("hex");

  const params = new URLSearchParams({
    token,
    expires: String(expires),
    // Nothing plays until the student presses play, and the position is
    // remembered so a half-watched lesson resumes where they left off.
    autoplay: "false",
    rememberPosition: "true",
  });
  return `https://${host}/embed/${libraryId}/${videoId}?${params}`;
}
