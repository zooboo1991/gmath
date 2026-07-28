// Articles created before the rich-text editor was added stored `content`
// as plain text (paragraphs separated by newlines) instead of HTML. Both
// the public detail page and the admin editor need to tell which format a
// given article is in, and the editor needs to upgrade legacy text into
// paragraphs so it doesn't collapse into one unbroken blob on first edit.

export function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function toEditableHtml(content: string): string {
  if (isHtmlContent(content)) return content;
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}
