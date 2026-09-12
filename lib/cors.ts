/* The marketing site is a separate origin — plain static HTML on
   relevestaffing.com — and it needs two things from the app: the list of open
   roles, and somewhere to post an application. Those are the only two
   endpoints that answer a browser from anywhere but app.relevestaffing.com,
   and this is the allowlist that lets them. */
const ALLOWED = [
  'https://relevestaffing.com',
  'https://www.relevestaffing.com',
  'https://app.relevestaffing.com'
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin && ALLOWED.includes(origin);
  /* An unrecognised origin gets no allow-origin at all, rather than the
     marketing site's — the browser refused either way, but naming a domain
     the caller never used made the error read as a misconfiguration there. */
  return {
    ...(ok ? { 'access-control-allow-origin': origin! } : {}),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'origin'
  };
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}
