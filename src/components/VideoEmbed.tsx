"use client";

import Image from "next/image";
import { useState } from "react";
import { IconPlay } from "@/components/icons";
import { parseYouTubeId, youTubeEmbedUrl, youTubeThumbnails } from "@/lib/youtube";

/**
 * Click-to-play YouTube embed.
 *
 * A YouTube iframe drags in roughly a megabyte of player script and a pile of
 * third-party cookies the moment it renders — on a marketing page that most
 * visitors scroll past, that is a real cost paid by every visitor for a video
 * few of them press. So until someone clicks, this is a poster image and a
 * button; the iframe is created on the click, with autoplay, so the first
 * click still starts the video.
 *
 * Renders nothing at all if the link isn't a YouTube video, so a half-filled
 * admin field can't produce a broken black box on a public page.
 */
export default function VideoEmbed({ url, title }: { url: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const id = parseYouTubeId(url);
  if (!id) return null;

  const poster = youTubeThumbnails(id);

  return (
    <div className="relative w-full pt-[56.25%] rounded-lg overflow-hidden bg-navy shadow-sm">
      {playing ? (
        <iframe
          src={youTubeEmbedUrl(id)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`${title} — бичлэг тоглуулах`}
          className="absolute inset-0 w-full h-full group cursor-pointer"
        >
          <Image
            src={posterFailed ? poster.fallback : poster.best}
            alt=""
            fill
            sizes="(max-width: 900px) 100vw, 570px"
            className="object-cover"
            onError={() => setPosterFailed(true)}
            unoptimized
          />
          <span className="absolute inset-0 bg-[rgba(5,15,35,.28)] group-hover:bg-[rgba(5,15,35,.14)] transition-colors" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="w-[74px] h-[74px] rounded-full bg-gold text-gold-ink grid place-items-center shadow-gold transition-transform group-hover:scale-110">
              <IconPlay className="w-6 h-6 ml-0.5" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
