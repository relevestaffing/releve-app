/* The address the app lives at, for redirects.
   -------------------------------------------
   On Netlify a function can see its own deploy address
   (<deploy-id>--releve-app.netlify.app) as request.url instead of the real
   host. A redirect built from that lands the person on a page with no
   session: the sign-in link "worked" and showed the sign-in form again.
   Found during the 1 November launch simulation. So redirects use the
   configured address, then the forwarded host, and never a netlify.app one. */
const CANONICAL = 'https://app.relevestaffing.com';

const LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i;

export function siteOrigin(request?: Request): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  if (request) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    let proto = request.headers.get('x-forwarded-proto') || '';
    if (!proto) { try { proto = new URL(request.url).protocol.replace(':', ''); } catch { proto = 'https'; } }
    /* Local development and phone testing on the LAN: the request is right,
       whatever the configured address says. */
    if (host && LOCAL.test(host)) return `${proto || 'http'}://${host}`;
    if (/^https?:\/\//.test(configured)) return configured;
    if (host && !/netlify\.app$/i.test(host)) return `${proto || 'https'}://${host}`;
    return CANONICAL;
  }
  if (/^https?:\/\//.test(configured)) return configured;
  return CANONICAL;
}
