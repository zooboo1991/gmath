import sanitizeHtml from "sanitize-html";

/**
 * Article content comes from the admin's Tiptap editor, but is sanitized
 * before it's ever written to the DB anyway — defense in depth in case a
 * session is ever compromised or something odd gets pasted into the editor.
 */
export function sanitizeArticleContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "h2",
      "h3",
      "strong",
      "em",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "img",
      "br",
      "code",
      "pre",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noreferrer", target: "_blank" }),
    },
  });
}
