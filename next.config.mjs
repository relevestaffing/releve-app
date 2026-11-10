/** @type {import('next').NextConfig} */

/* Security headers for every response.

   frame-ancestors / X-Frame-Options: people approve deposits and sign
   agreements inside this app, so no other site may load it in a frame.

   Referrer-Policy: the deposit and invoice pay-by-link URLs carry a signed
   token in the path, which the default policy would hand to any third party.

   Content-Security-Policy: a full policy now (PART 39 pass, 2 Oct 2026).
   What the browser actually loads, from a grep of app/ and components/:
     - our own origin (pages, /_next assets, /public images, sw.js, manifest)
     - Google Fonts (one stylesheet from fonts.googleapis.com, files from
       fonts.gstatic.com)
     - Supabase: the browser client talks to the project for sign-in, and
       photos and intro videos redirect to short-lived signed storage links
     - data: and blob: for the in-browser photo crop, video preview, and the
       inline SVG backgrounds in Viz
   Stripe Checkout and Zoom are full-page navigations or plain links, never
   scripts or frames, so they need no script-src entry. Agreements are read
   and signed in the app itself, so nothing is framed.

   Next 15 injects small inline scripts for hydration and the root layout sets
   one inline script before first paint. Without a nonce pipeline those need
   'unsafe-inline'; everything else stays locked to our own origin. Dev mode
   additionally needs 'unsafe-eval' for React Refresh. */
const SUPABASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lsionxcnatbozrzmftjh.supabase.co')
  .replace(/\/+$/, '');
const SUPABASE_WS = SUPABASE.replace(/^https:/, 'wss:');
const DEV = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${SUPABASE}`,
  `media-src 'self' data: blob: ${SUPABASE}`,
  `connect-src 'self' ${SUPABASE} ${SUPABASE_WS}`,
  "frame-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  ...(DEV ? [] : ['upgrade-insecure-requests'])
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' }
];

/* The team trainings (/learn/<token>, 10 November 2026) may play a lesson
   video from YouTube, Vimeo or Loom, and the link in the address bar is a
   private token, so the page sends no referrer at all. Listed after the
   site-wide headers so these two keys win on that path. */
const learnCsp = csp.replace("frame-src 'self'",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.loom.com");
const learnHeaders = [
  { key: 'Content-Security-Policy', value: learnCsp },
  { key: 'Referrer-Policy', value: 'no-referrer' }
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* A screen you have just been on comes back from memory for thirty seconds
     instead of a fresh server round trip, so back and the phone tabs are
     instant (3 November 2026). Every save already calls router.refresh(),
     which clears this. */
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
    /* NEXT_BUILD_CPUS=1 for a build inside the desktop sandbox, which runs out of open files with one worker per core */
    ...(process.env.NEXT_STATIC_CONC ? { staticGenerationMaxConcurrency: Number(process.env.NEXT_STATIC_CONC) } : {}),
    ...(process.env.NEXT_BUILD_CPUS ? { cpus: Number(process.env.NEXT_BUILD_CPUS), workerThreads: false } : {})
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/learn/:path*', headers: learnHeaders }
    ];
  }
};

export default nextConfig;
