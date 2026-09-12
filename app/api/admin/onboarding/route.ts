import { NextResponse } from 'next/server';
import { currentProfile, configured, supabaseServer } from '@/lib/supabase/server';
import { send, templates } from '@/lib/email';
import { SITE } from '@/lib/stripe';
import { depositLinkReady, signDepositLink } from '@/lib/deposit-link';

export const dynamic = 'force-dynamic';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (configured() && p.role !== 'admin')
    return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

/* Sent by hand, right after the discovery call.
   -----------------------------------------------
   One typed name and email, one send — this is the whole intake for an
   executive now, rather than adding the record on one screen and coming
   back to a role brief on another before there is anything to email. It
   still leaves the exact same trail behind it: a pending_people row (the
   thing that lets them ever become a client account at all, now that
   choosing that side for yourself is closed off) and the open search a
   deposit needs to attach to. The brief itself can be written later, from
   this same page — nothing here depends on it existing yet. */
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  /* Without DEPOSIT_LINK_SECRET there is no pay-by-link, but there is still
     a record to open and a letter to send — this used to refuse outright,
     which made the only way to create an executive depend on one env var. */
  const canLink = depositLinkReady();

  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  /* Whatever signing link (DocuSign, most likely) is already in hand for
     this person. Not stored — only used for this one send. */
  const docsUrl = String(b.docs_url ?? '').trim() || undefined;
  if (!name) return NextResponse.json({ error: 'What is their name?' }, { status: 400 });
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });

  if (!configured())
    return NextResponse.json({ ok: true, emailed: false, note: 'Preview mode — nothing was sent.' });

  try {
    const sb = await supabaseServer();

    /* Already signed in beats already pending, and either beats starting
       fresh — sending this twice for the same person must never split
       them into two records. */
    let clientId: string | null = null;
    let pendingId: string | null = null;

    const { data: profile } = await sb.from('profiles').select('id').ilike('email', email).maybeSingle();
    if (profile) clientId = (profile as any).id;

    if (!clientId) {
      const { data: pending } = await sb.from('pending_people')
        .select('id').ilike('email', email).is('claimed_by', null).maybeSingle();
      if (pending) pendingId = (pending as any).id;
    }

    if (!clientId && !pendingId) {
      const { data: created, error } = await sb.from('pending_people')
        .insert({ email, role: 'client', full_name: name, stage: 'Active' })
        .select('id').single();
      if (error) throw new Error(error.message);
      pendingId = (created as any).id;
    }

    const clientKey = clientId ?? pendingId!;
    const pending = !clientId;

    /* Relève opening the search is what "hiring" means from here on — the
       role brief can be filled in afterwards from this same row; an empty
       one still opens the search and still has a deposit to pay. */
    /* The open one, newest first. A repeat client with a closed search and
       a second open one has two rows, and maybeSingle() on two rows is an
       error that used to be discarded — which then opened a third search. */
    const { data: existingSearch } = await sb.from('searches')
      .select('id, deposit_cents')
      .or(`client_id.eq.${clientKey},pending_id.eq.${clientKey}`)
      .is('closed_at', null)
      .order('opened_at', { ascending: false }).limit(1).maybeSingle();

    let searchId: string, cents: number;
    if (existingSearch) {
      searchId = (existingSearch as any).id;
      cents = (existingSearch as any).deposit_cents ?? 50_000;
    } else {
      const key = pending ? { pending_id: clientKey } : { client_id: clientKey };
      const { data: made, error } = await sb.from('searches')
        .insert({ ...key, role_title: '', stage: 'Sourcing' })
        .select('id, deposit_cents').single();
      if (error) throw new Error(error.message);
      searchId = (made as any).id;
      cents = (made as any).deposit_cents ?? 50_000;
    }

    const payUrl = canLink ? `${SITE}/pay/${signDepositLink(searchId)}` : `${SITE}/app/billing`;
    const sent = await send(email, templates.depositReady({
      name: name.split(' ')[0] ?? '', payUrl, cents, docsUrl
    }));

    return NextResponse.json({
      ok: true, emailed: sent,
      warning: canLink ? undefined
        : 'Sent without a pay-by-link (DEPOSIT_LINK_SECRET is not set in Netlify) — the button in their email opens their billing page instead.'
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
