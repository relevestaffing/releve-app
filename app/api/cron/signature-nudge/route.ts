import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { send, signatureNudge } from '@/lib/email';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* The onboarding nudge, for an executive whose Signature has stalled.
   -------------------------------------------------------------------
   Found in the 12 October onboarding audit: both existing nudges are
   post-placement, so an executive who paid the deposit and then did not
   finish their Signature was chased by nobody and nothing. The Signature is
   what every candidate is scored against, so a stalled one halts sourcing
   entirely — while the fourteen-day clock runs.

   Who gets one: a client whose search is open with the deposit settled, who
   has no signature row, whose search opened at least three days ago. Three
   days rather than one because somebody who intends to do it this week should
   not be chased on Tuesday for something they planned for Thursday.

   Sent once per person, ever. email_log is the guard, with no time window on
   the lookup — unlike the monthly pulse, there is no "next month" for this
   message, and an executive who decided not to finish should not be asked
   again by a machine. That is a conversation for their manager. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           ?? process.env.SUPABASE_SECRET_KEY
           ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('[cron] missing', !url ? 'NEXT_PUBLIC_SUPABASE_URL' : 'the Supabase service key');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  /* Open searches, deposit settled, opened at least three days ago. */
  const { data: searches, error } = await sb.from('searches')
    .select('client_id, opened_at, deposit_status, closed_at')
    .is('closed_at', null)
    .in('deposit_status', ['paid', 'waived'])
    .lte('opened_at', cutoff);
  if (error) {
    console.error('[signature-nudge] could not read searches:', error.message);
    return NextResponse.json({ error: 'could not read searches' }, { status: 500 });
  }

  const clientIds = [...new Set((searches ?? []).map((s: any) => s.client_id).filter(Boolean))];
  if (!clientIds.length) return NextResponse.json({ ok: true, due: 0, sent: 0, skipped: 0 });

  /* Anyone who already has a Signature is done and is never nudged. Keyed on
     (user_id, side): side matters, because the same person can hold a talent
     Signature too and that one says nothing about their executive account. */
  const { data: sigs } = await sb.from('signatures')
    .select('user_id').eq('side', 'client').in('user_id', clientIds);
  const haveSignature = new Set((sigs ?? []).map((s: any) => s.user_id));

  const outstanding = clientIds.filter(id => !haveSignature.has(id));
  if (!outstanding.length) return NextResponse.json({ ok: true, due: 0, sent: 0, skipped: 0 });

  const { data: people } = await sb.from('profiles')
    .select('id, full_name, email').in('id', outstanding);

  let sent = 0, skipped = 0;
  for (const who of (people ?? []) as any[]) {
    if (!who?.email) { skipped++; continue; }

    /* Once per person, ever — see the note above. ok=true matters: email_log
       records failed sends as well, and a bounce or an SMTP hiccup must not
       count as "they have been nudged" and silence this forever. */
    const { data: already } = await sb.from('email_log')
      .select('id').eq('kind', 'signatureNudge').eq('to_addr', who.email)
      .eq('ok', true).limit(1).maybeSingle();
    if (already) { skipped++; continue; }

    const first = String(who.full_name ?? '').split(' ')[0] || 'there';
    if (await send(who.email, signatureNudge(first))) sent++;
    else skipped++;
  }

  return NextResponse.json({ ok: true, due: outstanding.length, sent, skipped });
}
