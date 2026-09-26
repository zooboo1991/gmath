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
      // The founder's page moved from /teacher to /ganbat — a name reads
      // better in a shared link than a job title, and it matches
      // /team/batchimeg. Both old addresses keep working: Facebook posts and
      // Google's index still point at them.
      { source: "/teacher", destination: "/ganbat", permanent: true },
      // /team/ganbat never had its own page; it used to send people to
      // /teacher, so it now goes straight to the new address rather than
      // hopping through the redirect above.
      { source: "/team/ganbat", destination: "/ganbat", permanent: true },
    ];
  },
};

export default nextConfig;
