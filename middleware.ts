import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/* Keeps the session cookie fresh on every request, cheaply. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: { name: string; value: string; options?: any }[]) => {
        list.forEach((c) => request.cookies.set(c.name, c.value));
        response = NextResponse.next({ request });
        list.forEach((c) => response.cookies.set(c.name, c.value, c.options));
      }
    }
  });
  /* getClaims verifies the token locally against the project's signing keys
     (one JWKS fetch, cached), where getUser was a network round trip to the
     auth server on every single page. A token near expiry still refreshes
     through the cookie adapter above. */
  await supabase.auth.getClaims();
  return response;
}
export const config = {
  /* Real static files in /public, so the session refresh above doesn't run
     (and burn a Supabase auth.getUser() call) on every icon, manifest and
     service-worker request. Keep this list in sync with /public. */
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.png|apple-touch-icon\\.png|icon-512\\.png|icon-1024\\.png|og-card\\.jpg|logo-.*\\.png|manifest\\.webmanifest|robots\\.txt|sw\\.js|splash/.*|fonts/.*|social30/.*|learn-assets/.*).*)'
  ]
};
