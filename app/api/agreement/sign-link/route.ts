import { NextResponse } from 'next/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
import { configured } from '@/lib/supabase/server';
import { buildSignedAgreement } from '@/lib/agreement-pdf';
import { AGREEMENT_VERSION } from '@/lib/agreement-text';
import { verifyDepositLink } from '@/lib/deposit-link';
import { signerForSearch, savePendingSignature, pendingSigned } from '@/lib/agreement-link';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';
import { CONTACT_EMAIL } from '@/lib/experience-public';
import { sameSigner } from '@/lib/words';

export const dynamic = 'force-dynamic';

/* Signing from the onboarding email, no account and no sign-in needed.
   The email's signed link is the authority, the same one the deposit uses.
   The typed name has to match the name Relève onboarded them under. */
export async function POST(req: Request) {
  if (!configured() || !hasServiceKey())
    return NextResponse.json({ error: 'Signing is not available in preview.' }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const link = verifyDepositLink(String(b.token ?? ''));
  if (!link) return NextResponse.json({ error: 'That link has expired. Ask your Client Success Manager for a fresh one.' }, { status: 400 });
  if (b.version !== AGREEMENT_VERSION)
    return NextResponse.json({ error: 'This agreement was updated. Please reload the page and read it again.' }, { status: 409 });
  if (b.agreed !== true)
    return NextResponse.json({ error: 'Please confirm you have read and agree to the agreement.' }, { status: 400 });

  const who = await signerForSearch(link.searchId);
  if (!who) return NextResponse.json({ error: 'That link is no longer open.' }, { status: 400 });

  const signed = String(b.signed_name ?? '').trim().replace(/\s+/g, ' ');
  if (signed.length < 3) return NextResponse.json({ error: 'Please type your full name as your signature.' }, { status: 400 });
  const onFile = who.name.replace(/\s+/g, ' ');
  if (onFile && !sameSigner(signed, onFile))
    return NextResponse.json({
      error: `That does not match the name on file (${onFile}). Sign as yourself, or write to ${CONTACT_EMAIL} and we will correct the name first.`
    }, { status: 400 });
  const name = onFile || signed;

  try {
    const ad = adminClient();
    if (who.clientId) {
      const { data: row } = await ad.from('client_agreements').select('state').eq('client_id', who.clientId).maybeSingle();
      if ((row as any)?.state === 'verified') return NextResponse.json({ ok: true, already: true });
    } else if (who.pendingId && await pendingSigned(who.pendingId)) {
      return NextResponse.json({ ok: true, already: true });
    }

    const ip = (req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim() || null;
    const now = new Date();
    const business = String(b.business ?? '').trim().slice(0, 120) || who.business || null;
    const pdf = await buildSignedAgreement({ name, email: who.email, signedAt: now, ip, userAgent: req.headers.get('user-agent'), business });

    if (who.clientId) {
      const path = `${who.clientId}/client-agreement.pdf`;
      const { error: upErr } = await ad.storage.from('agreements').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { error } = await ad.from('client_agreements').upsert({
        client_id: who.clientId, state: 'verified', file_path: path,
        file_name: 'Relève Client Services Agreement (signed).pdf',
        signed_on: now.toISOString().slice(0, 10), verified_at: now.toISOString(),
        envelope_id: null, reject_reason: null
      }, { onConflict: 'client_id' });
      if (error) throw new Error(error.message);
    } else if (who.pendingId) {
      await savePendingSignature(who.pendingId, pdf, { name, at: now.toISOString(), version: AGREEMENT_VERSION });
    } else {
      throw new Error('Nobody to file this under.');
    }

    const attachment = { filename: 'Releve-Client-Services-Agreement-signed.pdf', content: pdf, contentType: 'application/pdf' };
    const copy = await send(who.email, { ...templates.clientAgreementSigned(name.split(' ')[0], false), kind: 'clientAgreementSigned', attachments: [attachment] });
    await send(CONTACT_EMAIL, { ...templates.clientAgreementSignedTeam({ name, email: who.email }), kind: 'clientAgreementSignedTeam', attachments: [attachment] });
    return NextResponse.json({ ok: true, emailed: copy, to: who.email });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
