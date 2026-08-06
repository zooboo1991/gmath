import type { NextConfig } from "next";

// A full Content-Security-Policy (script-src/style-src/img-src/connect-src
// etc) needs per-domain allowlisting — Supabase storage, QPay, Zoom,
// Facebook embeds — and careful testing before it's safe to ship on a site
// handling real payments. `frame-ancestors` alone is the modern equivalent
// of X-Frame-Options: it blocks clickjacking without touching scripts,
// styles, fonts, or images, so it can't break anything.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
