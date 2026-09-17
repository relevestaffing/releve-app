/** @type {import('next').NextConfig} */

/* Netlify already sends Strict-Transport-Security and X-Content-Type-Options.
   These are the ones nothing was sending.

   frame-ancestors is the one that matters here: people approve deposits and
   sign talent agreements inside this app, and without it any site can load
   those screens in a hidden frame and collect the click. X-Frame-Options is
   the same instruction for older browsers that ignore the CSP form.

   Referrer-Policy matters because the deposit and invoice pay-by-link URLs
   carry a signed token in the path — the default policy would hand that whole
   URL to any third-party resource a page loads.

   This is deliberately not a full Content-Security-Policy. A real script-src
   needs testing against every page and would break the app if it were wrong;
   frame-ancestors on its own governs framing only and cannot. */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' }
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  }
};

export default nextConfig;
