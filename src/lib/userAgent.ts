/** Lightweight, display-only device summary — not a full UA parser. */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Тодорхойгүй төхөөрөмж";

  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
    ? "Android"
    : /Mac OS X/.test(userAgent)
    ? "macOS"
    : /Windows/.test(userAgent)
    ? "Windows"
    : /Linux/.test(userAgent)
    ? "Linux"
    : "";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
    ? "Opera"
    : /CriOS\//.test(userAgent)
    ? "Chrome"
    : /FxiOS\//.test(userAgent)
    ? "Firefox"
    : /Chrome\//.test(userAgent)
    ? "Chrome"
    : /Firefox\//.test(userAgent)
    ? "Firefox"
    : /Safari\//.test(userAgent)
    ? "Safari"
    : "";

  return [os, browser].filter(Boolean).join(" · ") || "Тодорхойгүй төхөөрөмж";
}
