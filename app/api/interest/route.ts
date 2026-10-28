import { NextResponse } from 'next/server';
import { hasServiceKey, adminClient } from '@/lib/supabase/admin';
import { corsHeaders, preflight } from '@/lib/cors';
import { send, shell, p, esc } from '@/lib/email';
import { teamEmails } from '@/lib/work';
import { todayInPacific } from '@/lib/money-public';
import type { ProspectSource } from '@/lib/prospects-public';

export const dynamic = 'force-dynamic';

/* The "I'm interested" form on relevestaffing.com posts here. A stranger can
   write, so this stays narrow in the same way /api/apply does: the marketing
   site and the app are the only origins allowed (lib/cors), the body is a
   small JSON shape, every string is capped, and the write runs under the
   service role because a public caller has no session. One row lands in the
   lead pipeline, stage 'new', source 'website', due to be followed up today,
   so it surfaces on the Follow up today list straight away. */

/* Only these may come off the wire; anything else becomes 'website'. Calendly
   is left out on purpose, it is only ever set by the calendar import. */
const SOURCES: ProspectSource[] = ['website', 'referral', 'instagram', 'linkedin', 'event', 'other'];

function one(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function OPTIONS(req: Request) { return preflight(req); }

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get('origin'));
  const fail = (error: string, status = 400) =>
    NextResponse.json({ error }, { status, headers: cors });

  if (!hasServiceKey()) return fail('This form is not switched on yet.', 503);

  let body: any;
  try { body = await req.json(); }
  catch { return fail('We could not read that.'); }

  const name  = one(body?.name, 120);
  const email = one(body?.email, 200).toLowerCase();
  const org   = one(body?.org, 160) || null;
  const need  = String(body?.need ?? '').trim().slice(0, 4000) || null;
  const source: ProspectSource =
    SOURCES.includes(one(body?.source, 20) as ProspectSource) ? (one(body?.source, 20) as ProspectSource) : 'website';

  if (name.length < 2) return fail('Please tell us your name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('That email address does not look right.');

  const sb = adminClient();

  /* Gentle dedupe. There is a partial unique index on lower(email) for any
     open stage, so a second open lead with the same address would be refused
     anyway; catching it here keeps the visitor's experience clean and avoids
     clobbering a note the team has already written. If they are already an
     open lead, just move their clock forward and say thank you. */
  try {
    const { data: open } = await sb.from('prospects')
      .select('id').eq('email', email)
      .not('stage', 'in', '("won","lost")').limit(1).maybeSingle();
    if (open?.id) {
      await sb.from('prospects')
        .update({ last_touched_at: new Date().toISOString() })
        .eq('id', open.id)
        .then(() => {}, () => {});   // last_touched_at may not exist pre-migration
      await notify(name, email, org, need);
      return NextResponse.json({ ok: true }, { headers: cors });
    }
  } catch { /* a failed lookup is no reason to turn a lead away */ }

  /* The insert. Tolerant of the part51 columns (next_follow_up, the 'new'
     stage, the widened sources) not being in place yet: a failure there is
     logged, and the visitor still sees success rather than a form that looks
     broken. In the live schema this simply writes the lead. */
  const row = {
    full_name: name, email, org_name: org,
    source, stage: 'new', note: need, next_follow_up: todayInPacific()
  };
  const { error } = await sb.from('prospects').insert(row);
  if (error) {
    console.error('[interest] insert failed:', error.message);
    /* Retry without the follow-up date, the one field most likely missing
       before part51 runs, so a plain insert still lands where it can. */
    const retry = await sb.from('prospects')
      .insert({ full_name: name, email, org_name: org, source, stage: 'new', note: need });
    if (retry.error) console.error('[interest] retry insert failed:', retry.error.message);
  }

  await notify(name, email, org, need);
  return NextResponse.json({ ok: true }, { headers: cors });
}

/* Tell the team, best effort. Never holds up or fails the request: a lead
   that is filed but not announced is a nuisance; a dropped request is a bug. */
async function notify(name: string, email: string, org: string | null, need: string | null) {
  try {
    const addrs = await teamEmails();
    if (!addrs.length) return;
    const msg = {
      kind: 'newLead',
      subject: `New lead from the website: ${name}`,
      text: `${name} said they are interested.\n\n${email}${org ? ` · ${org}` : ''}${need ? `\n\nWhat they need:\n${need}` : ''}\n\nThey are in the lead pipeline, due to be followed up today.`,
      html: shell('New lead from the website',
        p(`<b>${esc(name)}</b> said they are interested.`) +
        p(`<a href="mailto:${esc(email)}">${esc(email)}</a>${org ? ` · ${esc(org)}` : ''}`) +
        (need ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #B0C4B2;white-space:pre-wrap;">${esc(need)}</p>` : '') +
        p('They are in the lead pipeline, due to be followed up today.'))
    };
    for (const addr of addrs) await send(addr, msg);
  } catch { /* the lead is filed either way */ }
}
