import { NextResponse } from 'next/server';
import { supabaseServer, configured } from '@/lib/supabase/server';
import { saveCalendar } from '@/lib/store';

/* Where the magic link and Google both land. Exchanges the code for a
   session, makes sure a profile row exists, then sends them to their account. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (!configured() || !code) return NextResponse.redirect(`${origin}/app`);

  const sb = await supabaseServer();
  const { data: session, error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`);

  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const { data: existing } = await sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (!existing) {
      const { error } = await sb.from('profiles').insert({
        id: user.id, email: user.email,
        full_name: (user.user_metadata as any)?.full_name ?? null,
        role: 'talent'          // a placeholder only — the account picks its own side on first run,
                                // and claim_pending() overrides both if Relève added them by hand
      });
      /* If this fails silently, the account signs in with no profile row.
         /app then finds no profile and sends them to /, which sees a live
         session and sends them back to /app — a loop with no way out. Better
         to say so once than to bounce someone forever. */
      if (error) {
        console.error('[auth] could not create the profile row:', error.message);
        return NextResponse.redirect(
          `${origin}/?error=${encodeURIComponent('Your account could not be set up. Please try again, or write to hello@relevestaffing.com.')}`);
      }
    }
  }

  /* If they granted the calendar scope, Google returns a refresh token once —
     store it now or it is gone. */
  const refresh = (session as any)?.session?.provider_refresh_token;
  if (user && refresh) {
    await saveCalendar(user.id, refresh, user.email ?? null);
    if (searchParams.get('calendar') === '1') return NextResponse.redirect(`${origin}/app/availability?calendar=connected`);
  }
  return NextResponse.redirect(`${origin}/app`);
}
