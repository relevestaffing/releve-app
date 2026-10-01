import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { docusignClientReady, sendClientAgreement } from '@/lib/docusign';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* The Executives-console half of the Client Services Agreement flow —
   mirrors app/api/vetting/docusign/route.ts for talent. Sage sends it
   from the client's row on /console/people; they can also start it
   themselves from their own dashboard (see the sign route beside this
   one). Either way it is a two-signer envelope: the client signs first,
   Sage countersigns second — see lib/docusign.ts. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: 'no storage in demo mode' }, { status: 400 });
  if (!docusignClientReady())
    return NextResponse.json({ error: 'DocuSign is not switched on for the client agreement yet.' }, { status: 503 });

  const b = await req.json().catch(() => ({}));
  const clientId = String(b.client_id ?? '');
  if (!clientId) return NextResponse.json({ error: 'Whose agreement?' }, { status: 400 });

  const sb = await supabaseServer();
  const { data: person } = await sb.from('profiles')
    .select('full_name, email').eq('id', clientId).maybeSingle();
  if (!person) return NextResponse.json({ error: 'Could not find that person.' }, { status: 404 });

  try {
    const name = String((person as any).full_name ?? (person as any).email);
    const email = String((person as any).email);
    const envelopeId = await sendClientAgreement({ name, email, clientUserId: clientId });

    const { error } = await sb.from('client_agreements').upsert({
      client_id: clientId, state: 'submitted',
      envelope_id: envelopeId, submitted_at: new Date().toISOString(),
      verified_at: null, file_path: null, file_name: null, reject_reason: null
    }, { onConflict: 'client_id' });
    if (error) throw new Error(error.message);

    /* An embedded envelope is never emailed by DocuSign itself — this is
       the only nudge that tells them it is waiting, same reasoning as
       agreementReady on the talent side. */
    await send(email, templates.clientAgreementReady(name));

    return NextResponse.json({ ok: true, envelopeId });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
