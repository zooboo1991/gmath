/**
 * Pulling a video id out of whatever YouTube gave the teacher.
 *
 * YouTube hands out at least four shapes for the same video depending on where
 * you press "share" — the watch page, the short youtu.be link, the /embed/ URL,
 * and the Shorts URL — and the admin should not have to know which one we
 * accept. A bare 11-character id is accepted too, since that is what a person
 * ends up with after trimming a URL by hand.
 *
 * No node imports, so the browser can use the same rule the server does.
 */

/** YouTube ids are exactly 11 chars of [A-Za-z0-9_-]. */
const ID = "[A-Za-z0-9_-]{11}";

const PATTERNS = [
  new RegExp(`youtube\\.com/watch\\?(?:.*&)?v=(${ID})`, "i"),
  new RegExp(`youtu\\.be/(${ID})`, "i"),
  new RegExp(`youtube\\.com/embed/(${ID})`, "i"),
  new RegExp(`youtube\\.com/shorts/(${ID})`, "i"),
  new RegExp(`youtube\\.com/live/(${ID})`, "i"),
];

export function parseYouTubeId(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (new RegExp(`^${ID}$`).test(trimmed)) return trimmed;

  for (const pattern of PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Poster images for the click-to-play frame, best first.
 *
 * `maxresdefault` (1280x720) is the only one sharp enough for a full-width
 * frame, but YouTube generates it only for videos uploaded above 720p — asking
 * for a missing one returns a placeholder, so the caller falls back to
 * `hqdefault`, which always exists.
 */
export function youTubeThumbnails(id: string): { best: string; fallback: string } {
  return {
    best: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    fallback: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

/**
 * `youtube-nocookie.com` keeps YouTube from writing tracking cookies until the
 * visitor actually presses play — which also keeps this page honest about the
 * consent it never asked for.
 */
export function youTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
}
