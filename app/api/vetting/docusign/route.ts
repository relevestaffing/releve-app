import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { docusignReady, sendTalentAgreement } from '@/lib/docusign';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* Replaces "email a PDF, wait, upload the signed copy back" with one
   click: DocuSign holds the envelope, the talent signs it themselves
   in-app from their own Verification page (clientUserId below makes this
   an embedded signer, not a remote one — see lib/docusign.ts), and the
   webhook at /api/webhooks/docusign files what comes back against this
   same vetting row. IssueAgreement's manual upload stays as the fallback
   for a copy that arrives some other way. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: 'no storage in demo mode' }, { status: 400 });
  if (!docusignReady())
    return NextResponse.json({ error: 'DocuSign is not switched on yet.' }, { status: 503 });

  const b = await req.json().catch(() => ({}));
  const talentId = String(b.talent_id ?? '');
  if (!talentId) return NextResponse.json({ error: 'Whose agreement?' }, { status: 400 });

  const sb = await supabaseServer();
  const { data: person } = await sb.from('profiles')
    .select('full_name, email').eq('id', talentId).maybeSingle();
  if (!person) return NextResponse.json({ error: 'Could not find that person.' }, { status: 404 });

  try {
    const name = String((person as any).full_name ?? (person as any).email);
    const email = String((person as any).email);
    const envelopeId = await sendTalentAgreement({ name, email, clientUserId: talentId });

    /* Same row IssueAgreement's manual upload writes to — 'submitted' until
       the webhook (or, if that is ever off, a manual upload) moves it to
       verified. */
    const { error } = await sb.from('vetting').upsert({
      talent_id: talentId, kind: 'agreement', state: 'submitted',
      envelope_id: envelopeId, issued_by_team: true,
      submitted_at: new Date().toISOString(),
      verified_at: null, file_path: null, file_name: null, reject_reason: null
    }, { onConflict: 'talent_id,kind' });
    if (error) throw new Error(error.message);

    /* An embedded envelope is never emailed by DocuSign itself — this is
       now the only nudge that tells them it is waiting. */
    await send(email, templates.agreementReady(name));

    return NextResponse.json({ ok: true, envelopeId });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
