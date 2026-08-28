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
 *
 * Recognising a Bunny link lives in `bunnyVideo.ts` instead, because the admin
 * lesson editor needs the same rule in the browser and this module cannot go
 * there — it imports node's `crypto`.
 */

export { parseBunnyVideoId } from "./bunnyVideo";

export function bunnyConfigured(): boolean {
  return Boolean(process.env.BUNNY_STREAM_LIBRARY_ID && process.env.BUNNY_STREAM_TOKEN_KEY);
}

/** Default lifetime of a playback URL. Long enough to watch a lesson twice, short enough that a leaked link dies the same day. */
const DEFAULT_TTL_SECONDS = 3 * 60 * 60;

/**
 * Signs an embed URL for one video.
 *
 * Bunny's embed-view token is `SHA256_HEX(tokenKey + videoId + expires)` with
 * `expires` a unix timestamp in **seconds** — milliseconds are rejected.
 *
 * The host stays configurable, but the default is `iframe.mediadelivery.net`
 * — the one that actually serves embeds. `player.mediadelivery.net` answers
 * 404 to every /embed/ path, whatever the library or video id, which is what
 * a student saw inside the player instead of their lesson.
 */
export function signBunnyEmbedUrl(videoId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const tokenKey = process.env.BUNNY_STREAM_TOKEN_KEY;
  if (!libraryId || !tokenKey) {
    throw new Error("BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_TOKEN_KEY тохируулаагүй байна");
  }

  const host = process.env.BUNNY_STREAM_EMBED_HOST || "iframe.mediadelivery.net";
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
