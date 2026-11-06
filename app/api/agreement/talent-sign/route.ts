import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
import { buildSignedAgreement, TALENT_DOC } from '@/lib/agreement-pdf';
import { TALENT_AGREEMENT_VERSION } from '@/lib/talent-agreement-text';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';
import { CONTACT_EMAIL } from '@/lib/experience-public';
import { sameSigner } from '@/lib/words';

export const dynamic = 'force-dynamic';

/* Talent sign their Independent Contractor and Confidentiality Agreement in
   the app, the same way an executive signs theirs. They tick that they have
   read it, type the name on their account and their country of residence.
   The server builds the signed PDF from the exact text version shown, files
   it with their verification documents as a verified agreement, and emails
   them and the team a copy. Nothing here needs a third-party signing service. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  if (me.role !== 'talent') return NextResponse.json({ error: 'talent accounts only' }, { status: 403 });
  if (!configured() || !hasServiceKey())
    return NextResponse.json({ error: 'Signing is not available in preview.' }, { status: 503 });

  const b = await req.json().catch(() => ({}));
  if (b.version !== TALENT_AGREEMENT_VERSION)
    return NextResponse.json({ error: 'This agreement was updated. Please reload the page and read it again.' }, { status: 409 });
  if (b.agreed !== true)
    return NextResponse.json({ error: 'Please confirm you have read and agree to the agreement.' }, { status: 400 });

  const signed = String(b.signed_name ?? '').trim().replace(/\s+/g, ' ');
  if (signed.length < 3)
    return NextResponse.json({ error: 'Please type your full name as your signature.' }, { status: 400 });
  const onFile = String(me.full_name ?? '').trim().replace(/\s+/g, ' ');
  if (onFile && !sameSigner(signed, onFile))
    return NextResponse.json({
      error: `That does not match the name on your account (${onFile}). Sign as yourself, or write to ${CONTACT_EMAIL} and we will correct the name first.`
    }, { status: 400 });
  const country = String(b.country ?? '').trim().slice(0, 80);
  if (country.length < 2)
    return NextResponse.json({ error: 'Please enter your country of residence.' }, { status: 400 });
  const name = onFile || signed;

  try {
    const ad = adminClient();
    const { data: row } = await ad.from('vetting').select('state')
      .eq('talent_id', me.id).eq('kind', 'agreement').maybeSingle();
    if ((row as any)?.state === 'verified')
      return NextResponse.json({ error: 'Your agreement is already signed. It is on your Verification page.' }, { status: 400 });

    const ip = (req.headers.get('x-nf-client-connection-ip')
      ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim() || null;
    const now = new Date();
    const pdf = await buildSignedAgreement({
      name, email: me.email, signedAt: now, ip, userAgent: req.headers.get('user-agent'), country
    }, TALENT_DOC);

    const path = `${me.id}/agreement.pdf`;
    const { error: upErr } = await ad.storage.from('vetting')
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { error } = await ad.from('vetting').upsert({
      talent_id: me.id, kind: 'agreement', state: 'verified', issued_by_team: true,
      file_path: path, file_name: 'Relève Independent Contractor Agreement (signed).pdf',
      signed_on: now.toISOString().slice(0, 10),
      submitted_at: now.toISOString(), verified_at: now.toISOString(),
      envelope_id: null, reject_reason: null
    }, { onConflict: 'talent_id,kind' });
    if (error) throw new Error(error.message);
    /* Best effort: the version signed, for the record. Older databases
       without the column ignore this. */
    await ad.from('vetting').update({ agreement_version: TALENT_AGREEMENT_VERSION })
      .eq('talent_id', me.id).eq('kind', 'agreement');

    const attachment = {
      filename: 'Releve-Contractor-Agreement-signed.pdf', content: pdf, contentType: 'application/pdf'
    };
    const first = name.split(' ')[0];
    const copy = await send(me.email, { ...templates.talentAgreementSigned(first), kind: 'talentAgreementSigned', attachments: [attachment] });
    await send(CONTACT_EMAIL, { ...templates.talentAgreementSignedTeam({ name, email: me.email, country }), kind: 'talentAgreementSignedTeam', attachments: [attachment] });

    return NextResponse.json({ ok: true, emailed: copy, to: me.email });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
