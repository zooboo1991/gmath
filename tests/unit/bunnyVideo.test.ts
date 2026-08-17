/**
 * parseBunnyVideoId — the one rule that decides whether a lesson recording
 * plays inside gmath.mn behind a signed, expiring URL, or is handed to the
 * browser as an ordinary link.
 *
 * Getting it wrong is not a cosmetic failure. Too narrow, and a real Bunny
 * video is opened as a bare URL in a new tab, where Bunny's token
 * authentication answers 403 (this is what a pasted thumbnail URL did). Too
 * wide, and a Drive or storage-zone link is mistaken for a video GUID and never
 * opens at all.
 */

import { describe, expect, it } from "vitest";
import { parseBunnyVideoId } from "@/lib/bunnyVideo";

const GUID = "73b1b96f-825f-48bf-a1a2-1209cb7d85ba";
const LIBRARY = "727784";
const ZONE = "vz-108e5fbf-b38.b-cdn.net";

describe("what counts as a Bunny video", () => {
  it("takes a bare GUID, however it was pasted", () => {
    expect(parseBunnyVideoId(GUID)).toBe(GUID);
    expect(parseBunnyVideoId(`  ${GUID}\n`)).toBe(GUID);
    expect(parseBunnyVideoId(GUID.toUpperCase())).toBe(GUID);
  });

  it("takes the player links", () => {
    for (const url of [
      `https://player.mediadelivery.net/embed/${LIBRARY}/${GUID}`,
      `https://player.mediadelivery.net/play/${LIBRARY}/${GUID}`,
      `https://iframe.mediadelivery.net/embed/${LIBRARY}/${GUID}?autoplay=false`,
    ]) {
      expect(parseBunnyVideoId(url), url).toBe(GUID);
    }
  });

  /** Every link the dashboard lists under "Video and asset links". */
  it("takes the asset links from the video's own page", () => {
    for (const url of [
      `https://${ZONE}/${GUID}/playlist.m3u8`,
      `https://${ZONE}/${GUID}/thumbnail.jpg`,
      `https://${ZONE}/${GUID}/preview.webp`,
    ]) {
      expect(parseBunnyVideoId(url), url).toBe(GUID);
    }
  });

  it("takes the whole embed block copied out of the dashboard", () => {
    const embed = `<div style="position:relative;padding-top:56.25%;"><iframe src="https://iframe.mediadelivery.net/embed/${LIBRARY}/${GUID}?autoplay=true" loading="lazy" allowfullscreen></iframe></div>`;
    expect(parseBunnyVideoId(embed)).toBe(GUID);
  });
});

describe("what does not", () => {
  it("leaves recordings hosted elsewhere as plain links", () => {
    for (const url of [
      "https://drive.google.com/file/d/1a2b3c/view",
      "https://youtu.be/OngEFOhIZPM",
      "https://www.youtube.com/watch?v=OngEFOhIZPM",
    ]) {
      expect(parseBunnyVideoId(url), url).toBeNull();
    }
  });

  it("does not read a GUID out of a link that merely contains one", () => {
    // A Drive share id can be shaped like a GUID; the host is what decides.
    expect(parseBunnyVideoId(`https://drive.google.com/file/d/${GUID}/view`)).toBeNull();
    // A storage zone is not a video zone — "play this file" stays that.
    expect(parseBunnyVideoId(`https://gmath-files.b-cdn.net/${GUID}/lesson.mp4`)).toBeNull();
  });

  it("treats an empty field as no recording", () => {
    expect(parseBunnyVideoId("")).toBeNull();
    expect(parseBunnyVideoId("   ")).toBeNull();
    expect(parseBunnyVideoId(null)).toBeNull();
    expect(parseBunnyVideoId(undefined)).toBeNull();
  });
});
