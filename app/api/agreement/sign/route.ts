import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
import { buildSignedAgreement } from '@/lib/agreement-pdf';
import { AGREEMENT_VERSION } from '@/lib/agreement-text';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';
import { CONTACT_EMAIL } from '@/lib/experience-public';

export const dynamic = 'force-dynamic';

/* The executive signs their Client Services Agreement in the app.
   ----------------------------------------------------------------
   They tick that they have read it and type their full name, which has to be
   the name on their account (the name Relève onboarded them under), so the
   email, the account and the agreement all say the same thing. The server
   builds the signed PDF from the exact text version they were shown, files it
   where the console already looks for a client's agreement, marks it signed
   and filed, and emails them a copy. The team gets the same copy. Nothing
   here needs DocuSign. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  if (me.role !== 'client') return NextResponse.json({ error: 'executives only' }, { status: 403 });
  if (!configured() || !hasServiceKey())
    return NextResponse.json({ error: 'Signing is not available in preview.' }, { status: 503 });

  const b = await req.json().catch(() => ({}));
  if (b.version !== AGREEMENT_VERSION)
    return NextResponse.json({ error: 'This agreement was updated. Please reload the page and read it again.' }, { status: 409 });
  if (b.agreed !== true)
    return NextResponse.json({ error: 'Please confirm you have read and agree to the agreement.' }, { status: 400 });

  const signed = String(b.signed_name ?? '').trim().replace(/\s+/g, ' ');
  if (signed.length < 3)
    return NextResponse.json({ error: 'Please type your full name as your signature.' }, { status: 400 });
  const onFile = String(me.full_name ?? '').trim().replace(/\s+/g, ' ');
  if (onFile && signed.toLowerCase() !== onFile.toLowerCase())
    return NextResponse.json({
      error: `That does not match the name on your account (${onFile}). Sign as yourself, or write to ${CONTACT_EMAIL} and we will correct the name first.`
    }, { status: 400 });
  const name = onFile || signed;

  try {
    const ad = adminClient();
    const { data: row } = await ad.from('client_agreements').select('state').eq('client_id', me.id).maybeSingle();
    if ((row as any)?.state === 'verified')
      return NextResponse.json({ error: 'Your agreement is already signed. Your copy is in your account.' }, { status: 400 });

    const ip = (req.headers.get('x-nf-client-connection-ip')
      ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim() || null;
    const now = new Date();
    const business = String(b.business ?? '').trim().slice(0, 120) || (me as any).org_name || null;

    const pdf = await buildSignedAgreement({
      name, email: me.email, signedAt: now, ip, userAgent: req.headers.get('user-agent'), business
    });

    const path = `${me.id}/client-agreement.pdf`;
    const { error: upErr } = await ad.storage.from('agreements')
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { error } = await ad.from('client_agreements').upsert({
      client_id: me.id, state: 'verified',
      file_path: path, file_name: 'Relève Client Services Agreement (signed).pdf',
      signed_on: now.toISOString().slice(0, 10), verified_at: now.toISOString(),
      envelope_id: null, reject_reason: null
    }, { onConflict: 'client_id' });
    if (error) throw new Error(error.message);

    const attachment = {
      filename: 'Releve-Client-Services-Agreement-signed.pdf', content: pdf, contentType: 'application/pdf'
    };
    const first = name.split(' ')[0];
    const copy = await send(me.email, { ...templates.clientAgreementSigned(first), kind: 'clientAgreementSigned', attachments: [attachment] });
    await send(CONTACT_EMAIL, { ...templates.clientAgreementSignedTeam({ name, email: me.email }), kind: 'clientAgreementSignedTeam', attachments: [attachment] });

    return NextResponse.json({ ok: true, emailed: copy, to: me.email });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
