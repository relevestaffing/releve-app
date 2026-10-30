import { NextResponse, type NextRequest } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { docusignClientReady, sendClientAgreement, embeddedSigningUrl } from '@/lib/docusign';

export const dynamic = 'force-dynamic';

/* The link behind "Sign agreement" in the onboarding email.
   ---------------------------------------------------------
   One click from the letter to the signing page, with nothing in between:
   signed in, it opens (or reopens) the executive's Client Services Agreement
   in DocuSign and sends them there. Not signed in yet, it remembers where
   they were going, takes them through sign-in once, and the sign-in callback
   brings them straight back here. Already signed, or DocuSign not switched
   on, it simply lands them in their account, where the agreement's status
   is on the page. It never shows an error page: the worst case is the
   account, which says what is still to do. */
export async function GET(request: NextRequest) {
  /* The configured address, never the one the request arrived on: behind
     Netlify that can be a per-deploy hostname, not app.relevestaffing.com. */
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const to = (path: string) => NextResponse.redirect(new URL(path, origin));

  if (!configured()) return to('/app');

  const me = await currentProfile();
  if (!me) {
    const res = to('/');
    res.cookies.set('rel_next', '/agreement', { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 });
    return res;
  }
  if (me.role !== 'client' || !docusignClientReady()) return to('/app');

  const sb = await supabaseServer();
  const { data: row } = await sb.from('client_agreements')
    .select('state, envelope_id').eq('client_id', me.id).maybeSingle();
  if ((row as any)?.state === 'verified') return to('/app');

  const name = me.full_name ?? me.email;
  try {
    let envelopeId = (row as any)?.envelope_id as string | undefined;
    if (!envelopeId) {
      envelopeId = await sendClientAgreement({ name, email: me.email, clientUserId: me.id });
      await sb.from('client_agreements').upsert({
        client_id: me.id, state: 'submitted',
        envelope_id: envelopeId, submitted_at: new Date().toISOString(),
        verified_at: null, file_path: null, file_name: null, reject_reason: null
      }, { onConflict: 'client_id' });
    }
    const url = await embeddedSigningUrl({
      envelopeId, name, email: me.email, clientUserId: me.id, returnUrl: `${origin}/app?agreement=1`
    });
    return NextResponse.redirect(url);
  } catch {
    return to('/app');
  }
}
