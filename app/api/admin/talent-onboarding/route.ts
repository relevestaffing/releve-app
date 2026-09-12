import { NextResponse } from 'next/server';
import { currentProfile, configured, supabaseServer } from '@/lib/supabase/server';
import { send, templates } from '@/lib/email';
import { createPerson } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (configured() && p.role !== 'admin')
    return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

/* Sent by hand, for talent Sage sources herself — someone she has already
   spoken with, not someone who came in through the Careers page.
   -----------------------------------------------
   One typed name and email, one send: it opens their record and mails them
   the account link with the assessment inside it, the same letter the
   Careers-page invite flow sends an inbound applicant. No separate add step
   first — the record and the invitation happen together, matching what
   OnboardingSender already does on the executive side. Anything else about
   them (location, years, pay) can be filled in later from Add talent; this
   is only ever the fast path right after a call. */
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;

  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  const role = String(b.role ?? '').trim() || undefined;
  if (!name) return NextResponse.json({ error: 'What is their name?' }, { status: 400 });
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });

  if (!configured())
    return NextResponse.json({ ok: true, emailed: false, note: 'Preview mode — nothing was sent.' });

  try {
    const sb = await supabaseServer();

    /* Already signed in beats already pending, and either beats starting
       fresh — sending this twice for the same person must never split
       them into two records (they may also have applied through the
       Careers page already, which uses the same pending_people row). */
    const [{ data: signedUp }, { data: already }] = await Promise.all([
      sb.from('profiles').select('id').ilike('email', email).maybeSingle(),
      sb.from('pending_people').select('id').ilike('email', email).maybeSingle()
    ]);

    const alreadyPending = (already as any)?.id ?? null;
    if (!alreadyPending && !signedUp) {
      await createPerson({ role: 'talent', full_name: name, email, headline: role, stage: 'Applied' });
    }

    /* The record stands whether or not the mail server answers — a failed
       send should never look like a failed save. */
    const tpl = templates.applicationInvited({ name: name.split(/\s+/)[0], role: role ?? 'the role' });
    const sent = await send(email, tpl);

    return NextResponse.json({ ok: true, emailed: sent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
