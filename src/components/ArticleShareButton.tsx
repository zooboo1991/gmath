"use client";

import { IconFacebook } from "./icons";

/**
 * The article's Facebook share button. Same appearance as the plain link it
 * replaced; the only addition is a fire-and-forget POST so the admin list can
 * show how often each article gets shared.
 *
 * `keepalive` matters here: the click also opens the sharer window, and without
 * it a browser is free to drop an in-flight request from a page it's leaving.
 */
export default function ArticleShareButton({
  articleId,
  shareUrl,
}: {
  articleId: string;
  shareUrl: string;
}) {
  const record = () => {
    void fetch(`/api/articles/${articleId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "facebook" }),
      keepalive: true,
    }).catch(() => {});
  };

  return (
    <a
      href={shareUrl}
      target="_blank"
      rel="noreferrer"
      onClick={record}
      className="inline-flex items-center gap-2 font-extrabold text-[.85rem] text-blue-strong bg-blue-soft px-4 py-2 rounded-full shrink-0"
    >
      <IconFacebook className="w-4 h-4" /> Facebook-т хуваалцах
    </a>
  );
}
