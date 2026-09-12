import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { configured } from '@/lib/supabase/server';
import { saveCalendar } from '@/lib/store';
import { send, templates } from '@/lib/email';

export const dynamic = 'force-dynamic';

/* Where the magic link and Google both land.
   ------------------------------------------
   This used to build its client with the shared helper, which writes cookies
   through Next's ambient store inside a try/catch — necessary there, because
   a Server Component genuinely cannot set them. Here that catch was a trap:
   if the session cookie failed to write, nothing said so. The redirect to
   /app then found no session and bounced back to sign-in, and the second
   attempt worked only because the middleware had managed to refresh it in
   between. Signing in twice looked like a quirk; it was a dropped cookie.

   So this route no longer relies on the ambient store at all. It collects
   whatever cookies Supabase wants to set, then writes them onto the exact
   response it is about to return. Deterministic, and nothing is swallowed. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  const jar: { name: string; value: string; options?: any }[] = [];
  /* The session cookie rides on whichever response we end up returning —
     including the error ones, so a half-exchanged session is not left behind. */
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, origin));
    for (const c of jar) res.cookies.set(c.name, c.value, c.options);
    return res;
  };
  const fail = (msg: string) => go(`/?error=${encodeURIComponent(msg)}`);

  if (!configured() || !code) return go('/app');

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => { jar.push(...list); }
      }
    }
  );

  const { data: session, error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const { data: existing } = await sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (!existing) {
      const { error: made } = await sb.from('profiles').insert({
        id: user.id, email: user.email,
        full_name: (user.user_metadata as any)?.full_name ?? null,
        role: 'talent'          // a placeholder only — the account picks its own side on first run,
                                // and claim_pending() overrides both if Relève added them by hand
      });
      /* If this fails silently, the account signs in with no profile row.
         /app then finds no profile and sends them to /, which sees a live
         session and sends them back to /app — a loop with no way out. Better
         to say so once than to bounce someone forever. */
      if (made) {
        console.error('[auth] could not create the profile row:', made.message);
        return fail('Your account could not be set up. Please try again, or write to hello@relevestaffing.com.');
      }

      /* A profile that did not exist a moment ago — the one moment this email
         can fire, since nothing else marks a first sign-in. claim_pending()
         may just have filled in a name Relève already had on file (someone
         invited by hand rarely typed their own name into the sign-in box),
         so it is read back rather than trusted from what was just sent in —
         otherwise the one person Relève actually knows by name hears
         "Hello," instead of their own. Never worth failing sign-in over: a
         slow or unreachable mail host should not stand between someone and
         the first look at their own account. */
      if (user.email) {
        const { data: fresh } = await sb.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        await send(user.email, templates.profileWelcome((fresh as any)?.full_name ?? null));
      }
    }
  }

  /* If they granted the calendar scope, Google returns a refresh token once —
     store it now or it is gone. */
  const refresh = (session as any)?.session?.provider_refresh_token;
  if (user && refresh) {
    await saveCalendar(user.id, refresh, user.email ?? null);
    if (searchParams.get('calendar') === '1') return go('/app/availability?calendar=connected');
  }
  return go('/app');
}
