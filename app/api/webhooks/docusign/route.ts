import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyDocuSignWebhook, docusignWebhookReady, downloadCompletedEnvelope } from '@/lib/docusign';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* DocuSign telling us an agreement was signed — the only thing trusted to
   mark one verified from here on, the same boundary Stripe's webhook
   already draws for money: an unsigned request never reaches a single
   database call, and everything past that runs with the service role
   because DocuSign is not signed in as anybody. guard_vetting() (schema
   PART "DOCUSIGN") is what makes that safe: it only blocks a state change
   from an actually signed-in non-admin, and a service-role call carries no
   signed-in user at all.

   NOTE: the exact shape of DocuSign Connect's JSON delivery — event name,
   where the envelope id sits — is read defensively below rather than
   assumed, but has not been exercised against a real Connect subscription
   yet. Worth one test send once Connect is configured, to confirm this
   still matches what actually arrives. */
export async function POST(req: Request) {
  if (!docusignWebhookReady())
    return NextResponse.json({ error: 'no connect key configured' }, { status: 503 });

  const raw = await req.text();
  try {
    verifyDocuSignWebhook(raw, req.headers.get('x-docusign-signature-1'));
  } catch (e: any) {
    /* 400, not 500: a rejected request, not a broken server — DocuSign
       should not retry it. */
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad JSON' }, { status: 400 }); }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           ?? process.env.SUPABASE_SECRET_KEY
           ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'server not configured' }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const envelopeId: string | undefined =
    event.data?.envelopeId ?? event.data?.envelopeSummary?.envelopeId ?? event.envelopeId;
  const status: string = event.event ?? event.data?.envelopeSummary?.status ?? event.status ?? '';
  if (!envelopeId) return NextResponse.json({ ok: true, note: 'no envelope id on that event' });

  /* DocuSign Connect retries a non-200 for up to 24 hours. Same idempotency
     shape as stripe_events, keyed on the pair rather than one id DocuSign
     does not hand back the same simple way Stripe does: a repeat delivery
     of the same envelope reaching the same status fails the insert and
     stops before doing anything twice. */
  const { error: seen } = await sb.from('docusign_events').insert({ envelope_id: envelopeId, status });
  if (seen) return NextResponse.json({ ok: true, note: 'already handled' });

  try {
    if (status === 'envelope-completed' || status === 'completed') {
      const { data: row } = await sb.from('vetting')
        .select('id, talent_id').eq('envelope_id', envelopeId).eq('kind', 'agreement').maybeSingle();

      if (row) {
        const bytes = await downloadCompletedEnvelope(envelopeId);
        const path = `${(row as any).talent_id}/agreement.pdf`;
        const { error: upErr } = await sb.storage.from('vetting')
          .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
        if (upErr) throw new Error(upErr.message);

        await sb.from('vetting').update({
          state: 'verified', file_path: path, file_name: 'agreement.pdf',
          verified_at: new Date().toISOString(),
          signed_on: new Date().toISOString().slice(0, 10)
        }).eq('id', (row as any).id);

        const { data: person } = await sb.from('profiles')
          .select('full_name, email').eq('id', (row as any).talent_id).maybeSingle();
        if ((person as any)?.email) {
          await send((person as any).email, templates.vettingVerified(
            String((person as any).full_name ?? '').split(' ')[0] || 'there'
          ));
        }
      }
    } else if (status === 'envelope-declined' || status === 'envelope-voided'
            || status === 'declined' || status === 'voided') {
      await sb.from('vetting').update({
        state: 'rejected',
        reject_reason: status.includes('declined') ? 'Declined in DocuSign.' : 'Voided in DocuSign.'
      }).eq('envelope_id', envelopeId).eq('kind', 'agreement');
    }
  } catch (e: any) {
    /* Something went wrong handling a genuine, signed event — remove the
       dedup row so DocuSign's retry is not dismissed as a duplicate. */
    await sb.from('docusign_events').delete().eq('envelope_id', envelopeId).eq('status', status);
    return NextResponse.json({ error: safeMessage(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
