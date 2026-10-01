import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { docusignClientReady, sendClientAgreement, embeddedSigningUrl } from '@/lib/docusign';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

/* The client-facing half of the Client Services Agreement, embedded —
   mirrors app/api/vetting/docusign/sign/route.ts for talent. First click
   for someone Relève has not already sent an envelope for starts one;
   a later click before it is fully signed just reopens the same one. */
export async function POST() {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'client') return NextResponse.json({ error: 'executives only' }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: 'no storage in demo mode' }, { status: 400 });
  if (!docusignClientReady())
    return NextResponse.json({ error: 'DocuSign is not switched on yet.' }, { status: 503 });

  const sb = await supabaseServer();
  const { data: row } = await sb.from('client_agreements')
    .select('state, envelope_id').eq('client_id', me.id).maybeSingle();

  if (row?.state === 'verified')
    return NextResponse.json({ error: 'You are already signed and verified.' }, { status: 400 });

  const name = me.full_name ?? me.email;
  const returnUrl = `${SITE}/app?agreement=1`;

  try {
    let envelopeId = (row as any)?.envelope_id as string | undefined;

    if (!envelopeId) {
      envelopeId = await sendClientAgreement({ name, email: me.email, clientUserId: me.id });
      const { error } = await sb.from('client_agreements').upsert({
        client_id: me.id, state: 'submitted',
        envelope_id: envelopeId, submitted_at: new Date().toISOString(),
        verified_at: null, file_path: null, file_name: null, reject_reason: null
      }, { onConflict: 'client_id' });
      if (error) throw new Error(error.message);
    }

    const url = await embeddedSigningUrl({
      envelopeId, name, email: me.email, clientUserId: me.id, returnUrl
    });
    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
