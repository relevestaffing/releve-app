import { NextResponse } from 'next/server';
import { cronAllowed, cronClient } from '@/lib/cron-auth';
import { readinessFor } from '@/lib/studio-core';
import { send, shell, esc } from '@/lib/email';
import { CONTACT_EMAIL } from '@/lib/experience-public';
import { SITE } from '@/lib/stripe';
import { newToken } from '@/lib/studio';

export const dynamic = 'force-dynamic';

/* The 90-Day Plan, started for you (7 November 2026).
   ---------------------------------------------------
   When an executive has signed, settled their deposit and finished the three
   steps that match them with an assistant, their plan is drafted and Claude
   opens the interview, so it is waiting in the console rather than something
   to remember. The team gets one email. Once per executive, ever: the plan row
   is the guard. Only executives who signed from 7 November 2026 on are looked
   at, so switching this on does not start plans for everyone already placed. */
const FROM_DAY = '2026-11-07';

export async function POST(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'no' }, { status: 401 });
  const sb = cronClient();
  if (!sb) return NextResponse.json({ error: 'not configured' }, { status: 500 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: true, started: 0, note: 'No Anthropic key; nothing started.' });

  const { data: signed } = await sb.from('client_agreements').select('client_id, verified_at')
    .eq('state', 'verified').gte('verified_at', FROM_DAY);
  const ids = ((signed ?? []) as any[]).map(r => r.client_id as string);
  if (!ids.length) return NextResponse.json({ ok: true, started: 0 });

  const { data: have } = await sb.from('success_plans').select('client_id').in('client_id', ids);
  const planned = new Set(((have ?? []) as any[]).map(r => r.client_id));
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.URL ?? SITE).replace(/\/$/, '');
  const secret = process.env.CRON_SECRET!;
  let started = 0;

  for (const id of ids) {
    if (planned.has(id)) continue;
    const r = await readinessFor(sb, id);
    if (!r.ready) continue;
    const { data: prof } = await sb.from('profiles').select('full_name, org_name').eq('id', id).maybeSingle();
    const name = (prof as any)?.full_name ?? 'An executive';
    const company = (prof as any)?.org_name || name;
    const { data: made, error } = await sb.from('success_plans').insert({
      client_id: id, title: `Your 90-Day Success Plan: ${company}`, content: '', chat: [], state: 'working', view_token: newToken()
    }).select('id').single();
    if (error || !made) { console.error('[plan-ready] could not file the plan for', id, error?.message); continue; }
    const planId = (made as any).id as string;
    await fetch(`${base}/.netlify/functions/studio-turn-background`, {
      method: 'POST', headers: { 'x-cron-key': secret, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'plan', id: planId })
    }).catch(e => console.error('[plan-ready] could not start the interview:', e?.message ?? e));
    const href = `${SITE}/console/plan/${planId}`;
    await send(CONTACT_EMAIL, {
      kind: 'planReady', subject: `${name} has finished onboarding: their 90-Day Plan is ready to build`,
      text: `${name} has signed, settled the deposit and finished onboarding.\n\nTheir 90-Day Plan is started, with the first questions waiting for you: ${href}`,
      html: shell('Ready to build', `<p style="margin:0 0 15px;">${esc(name)} has signed, settled the deposit and finished onboarding.</p><p style="margin:0 0 15px;">Their 90-Day Plan is started, with the first questions waiting for you.</p>`, { label: 'Open the plan studio', href })
    });
    started++;
  }
  return NextResponse.json({ ok: true, started });
}
