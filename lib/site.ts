/* The address the app lives at, for redirects.
   -------------------------------------------
   On Netlify a function can see its own deploy address
   (<deploy-id>--releve-app.netlify.app) as request.url instead of the real
   host. A redirect built from that lands the person on a page with no
   session: the sign-in link "worked" and showed the sign-in form again.
   Found during the 1 November launch simulation. So redirects use the
   configured address, then the forwarded host, and never a netlify.app one. */
const CANONICAL = 'https://app.relevestaffing.com';

export function siteOrigin(request?: Request): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  if (/^https?:\/\//.test(configured)) return configured;
  if (request) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    if (host && !/netlify\.app$/i.test(host) && !/^localhost|^127\./.test(host)) return `${proto}://${host}`;
    if (/^localhost|^127\./.test(host)) return `http://${host}`;
  }
  return CANONICAL;
}
