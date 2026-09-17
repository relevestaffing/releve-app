import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { createPlacement, endPlacement } from '@/lib/work';
import { setPlacementRate } from '@/lib/money';
import { personEmail, getPlacement } from '@/lib/work';
import { send, templates } from '@/lib/email';
import { fmtDate } from '@/lib/words';
import { toCents, rateInRange } from '@/lib/money-public';
import { safeMessage } from '@/lib/errors';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  const { client_id, talent_id, started_on, rate, replaces_id } = await req.json();
  if (!client_id || !talent_id)
    return NextResponse.json({ error: 'pick both an executive and a talent' }, { status: 400 });
  if (client_id === talent_id)
    return NextResponse.json({ error: 'those are the same person' }, { status: 400 });
  /* The rate is set here rather than remembered later. Every hand-made
     placement used to arrive with none, which meant the monthly billing run
     skipped it silently and nothing was invoiced. */
  const cents = rate ? toCents(String(rate)) : null;
  if (rate && (cents == null || !rateInRange(cents)))
    return NextResponse.json({
      error: 'That rate is outside the agreed range. Leave it blank to set it later in Billing.'
    }, { status: 400 });

  try {
    const id = await createPlacement(client_id, talent_id, started_on, replaces_id ?? null);
    if (cents != null && id) await setPlacementRate(id, cents);

    /* Both sides are told, and pointed at the two-week plan that has just
       been generated for them. Nine onboarding steps used to appear in an
       account neither person had been asked to open. */
    try {
      const on = fmtDate(started_on || new Date().toISOString().slice(0, 10));
      const [exec, talent] = await Promise.all([personEmail(client_id), personEmail(talent_id)]);
      if (exec?.email && talent) {
        const t = templates.placementStarted({
          name: exec.name, withWhom: talent.full, startsOn: on, side: 'client' });
        await send(exec.email, t);
      }
      if (talent?.email && exec) {
        const t = templates.placementStarted({
          name: talent.name, withWhom: exec.full, startsOn: on, side: 'talent' });
        await send(talent.email, t);
      }
    } catch { /* the placement stands whether or not the mail went */ }

    return NextResponse.json({ ok: true, rateSet: cents != null });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  const { id, ended_on, reason } = await req.json();
  if (!id) return NextResponse.json({ error: 'which placement?' }, { status: 400 });
  try {
    await endPlacement(id, ended_on, reason);
    /* Both sides hear that it has ended, in their own terms. */
    try {
      const pl = await getPlacement(id);
      if (pl) {
        const endedOn = fmtDate(ended_on ?? new Date().toISOString().slice(0, 10));
        const [exec, talent] = await Promise.all([personEmail(pl.client_id), personEmail(pl.talent_id)]);
        if (exec?.email && talent) await send(exec.email, templates.placementEnded({ name: exec.name, withWhom: talent.full, endedOn, side: 'client' }));
        if (talent?.email && exec) await send(talent.email, templates.placementEnded({ name: talent.name, withWhom: exec.full, endedOn, side: 'talent' }));
      }
    } catch { /* it has ended either way */ }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
