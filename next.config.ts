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
  // Nothing gains from advertising the framework in every response, and it
  // hands a scanner one free hint about what to try.
  poweredByHeader: false,
  // Unset everywhere except the test runner, which builds into .next-test so
  // `npm test` and a `npm run dev` already running in the same folder don't
  // fight over one build directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // /team/ganbat is gone: the founder already had a fuller page at
      // /teacher, written before /team existed, and two pages about the same
      // person only compete with each other in search. A permanent redirect
      // rather than a 404 so links already shared keep landing somewhere.
      { source: "/team/ganbat", destination: "/teacher", permanent: true },
    ];
  },
};

export default nextConfig;
