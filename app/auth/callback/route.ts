import { siteOrigin } from '@/lib/site';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { configured } from '@/lib/supabase/server';
import { saveCalendar } from '@/lib/store';
import { send, templates, appGuideAttachment } from '@/lib/email';
import { noteSigninTrouble } from '@/lib/signin-watch';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
import { NOT_INVITED_CODE } from '@/lib/invite-copy';

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
  const { searchParams } = new URL(request.url);
  const origin = siteOrigin(request);
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

  /* Google (and Supabase) send a refusal back as ?error_description=… with no
     code. The database refuses a stranger before an account exists, and that
     arrives here, so it is shown on the sign-in screen instead of being lost
     in a redirect to /app that bounces straight back. */
  const refused = searchParams.get('error_description') ?? searchParams.get('error');
  if (configured() && !code && refused) {
    const low = refused.toLowerCase();
    if (low.includes('database error') || low.includes('invitation only') || low.includes('signups not allowed'))
      return go(`/?error=${NOT_INVITED_CODE}`);
    if (low.includes('access_denied') || low.includes('denied'))
      return fail('Sign-in did not finish. You can try again below.');
    return fail(refused);
  }

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
  if (error) {
    await noteSigninTrouble({ stage: 'exchange', detail: error.message });
    return fail(error.message);
  }

  const { data: { user } } = await sb.auth.getUser();
  let firstClientSignIn = false;
  if (user) {
    const { data: existing } = await sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (!existing) {
      /* Accounts are opened by invitation. The database already refuses a
         stranger, so this is a second lock for the same door, in case that
         one is ever missing or loosened: with no invitation on file for this
         address, no profile is made, no welcome email goes out, and no session
         is kept. An account made a moment ago for nobody is removed; anything
         older is left alone for a person to look at. */
      if (hasServiceKey() && user.email) {
        const ad = adminClient();
        const em = user.email.trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
        const { data: invite } = await ad.from('pending_people')
          .select('id').ilike('email', em).is('claimed_by', null).limit(1).maybeSingle();
        if (!invite) {
          console.error('[signin] refused, no invitation:', user.email);
          const age = Date.now() - new Date((user as any).created_at ?? 0).getTime();
          if (age < 15 * 60 * 1000) { try { await ad.auth.admin.deleteUser(user.id); } catch { /* the refusal still stands */ } }
          /* Deliberately not through go(): the session cookie is not written. */
          return NextResponse.redirect(new URL(`/?error=${NOT_INVITED_CODE}`, origin));
        }
      }
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
        await noteSigninTrouble({ email: user.email, stage: 'profile_create', detail: made.message });
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
      /* The name Relève typed when it onboarded this person is the name on
         their account. Sign-in (Google especially) hands over whatever name
         is on that Google profile, and claim_pending() lets it win, so an
         invitation to "Jose" could open an account called something else.
         Put the typed name back, so the email, the account and the
         agreement all say the same thing. */
      if (hasServiceKey()) {
        try {
          const ad = adminClient();
          const { data: pend } = await ad.from('pending_people')
            .select('full_name').eq('claimed_by', user.id).maybeSingle();
          const typed = String((pend as any)?.full_name ?? '').trim();
          if (typed) await ad.from('profiles').update({ full_name: typed }).eq('id', user.id);
        } catch { /* never worth failing sign-in over */ }
      }

      if (user.email) {
        const { data: fresh } = await sb.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle();
        await send(user.email, { ...templates.profileWelcome((fresh as any)?.full_name ?? null, (fresh as any)?.role ?? null), attachments: await appGuideAttachment() });
        if ((fresh as any)?.role === 'client') firstClientSignIn = true;
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
  /* "Sign agreement" in the onboarding email: they were sent to sign in
     first, so carry on to the agreement now. Only that one path is honoured. */
  if (request.cookies.get('rel_next')?.value === '/agreement') {
    const res = go('/agreement');
    res.cookies.set('rel_next', '', { path: '/', maxAge: 0 });
    return res;
  }
  /* First sign-in of a new executive: step four, putting Relève on their
     devices, before the dashboard. */
  if (firstClientSignIn) return go('/install');
  return go('/app');
}
