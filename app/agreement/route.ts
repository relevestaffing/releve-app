import { siteOrigin } from '@/lib/site';
import { NextResponse, type NextRequest } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/* The link behind "Sign agreement" in the onboarding email.
   ---------------------------------------------------------
   One click from the letter to the agreement. Signed in, it opens the Client
   Services Agreement (or, for talent, the contractor agreement) in their account, ready to read and sign. Not signed in
   yet, it remembers where they were going, takes them through sign-in once,
   and the sign-in callback brings them straight back here. Talent get
   their own contractor agreement the same way; the team lands in the console.
   Signing happens in the app (app/app/agreement). */
export async function GET(request: NextRequest) {
  /* The configured address, never the one the request arrived on: behind
     Netlify that can be a per-deploy hostname, not app.relevestaffing.com. */
  const origin = siteOrigin(request);
  const to = (path: string) => NextResponse.redirect(new URL(path, origin));

  if (!configured()) return to('/app');

  const me = await currentProfile();
  if (!me) {
    const res = to('/');
    res.cookies.set('rel_next', '/agreement', { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 });
    return res;
  }
  return to(me.role === 'client' || me.role === 'talent' ? '/app/agreement' : '/app');
}
