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
   Stripe Checkout, DocuSign signing and Zoom are all full-page navigations or
   plain links, never scripts or frames, so they need no script-src entry.
   DocuSign is allowed in frame-src only so an embedded signing view can be
   adopted later without touching this file.

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
  "frame-src 'self' https://*.docusign.net https://*.docusign.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
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

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  }
};

export default nextConfig;
