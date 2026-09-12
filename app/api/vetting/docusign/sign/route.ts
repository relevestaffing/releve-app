import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { docusignReady, sendTalentAgreement, embeddedSigningUrl } from '@/lib/docusign';

export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

/* The talent-facing half of DocuSign embedded signing: clicking "Sign now"
   on the Verification card lands here. First click for someone Relève
   has not already sent an envelope for starts one (clientUserId keeps it
   embeddable — see lib/docusign.ts); a later click before it is signed
   just reopens the same envelope. Either way this returns a one-time
   signing URL the browser redirects straight to. */
export async function POST() {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (!configured()) return NextResponse.json({ error: 'no storage in demo mode' }, { status: 400 });
  if (!docusignReady())
    return NextResponse.json({ error: 'DocuSign is not switched on yet.' }, { status: 503 });

  const sb = await supabaseServer();
  const { data: row } = await sb.from('vetting')
    .select('state, envelope_id').eq('talent_id', me.id).eq('kind', 'agreement').maybeSingle();

  if (row?.state === 'verified')
    return NextResponse.json({ error: 'You are already signed and verified.' }, { status: 400 });

  const name = me.full_name ?? me.email;
  const returnUrl = `${SITE}/app/vetting?signed=1`;

  try {
    let envelopeId = (row as any)?.envelope_id as string | undefined;

    if (!envelopeId) {
      envelopeId = await sendTalentAgreement({ name, email: me.email, clientUserId: me.id });
      const { error } = await sb.from('vetting').upsert({
        talent_id: me.id, kind: 'agreement', state: 'submitted',
        envelope_id: envelopeId, issued_by_team: true,
        submitted_at: new Date().toISOString(),
        verified_at: null, file_path: null, file_name: null, reject_reason: null
      }, { onConflict: 'talent_id,kind' });
      if (error) throw new Error(error.message);
    }

    const url = await embeddedSigningUrl({
      envelopeId, name, email: me.email, clientUserId: me.id, returnUrl
    });
    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
