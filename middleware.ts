import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/* Keeps the session cookie fresh on every request. */
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
  await supabase.auth.getUser();
  return response;
}
export const config = {
  /* Real static files in /public, so the session refresh above doesn't run
     (and burn a Supabase auth.getUser() call) on every icon, manifest and
     service-worker request. Keep this list in sync with /public. */
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.png|apple-touch-icon\\.png|icon-512\\.png|icon-1024\\.png|logo-.*\\.png|manifest\\.webmanifest|robots\\.txt|sw\\.js).*)'
  ]
};
