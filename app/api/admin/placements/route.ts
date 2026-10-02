import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { createPlacement, endPlacement } from '@/lib/work';
import { setPlacementRate } from '@/lib/money';
import { personEmail, getPlacement } from '@/lib/work';
import { send, templates } from '@/lib/email';
import { fmtDate } from '@/lib/words';
import { toCents, rateInRange, todayInPacific } from '@/lib/money-public';
import { ENDED_REASONS } from '@/lib/care-public';
import { configured, supabaseServer } from '@/lib/supabase/server';
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

  if (started_on && !/^\d{4}-\d{2}-\d{2}$/.test(String(started_on)))
    return NextResponse.json({ error: 'that start date is not a date' }, { status: 400 });

  /* A replacement settles the guarantee on the placement it replaces and
     inherits what is left of that one's minimum term, so it has to be a real
     guaranteed ending for the same executive. Anything else would let the
     minimum be reset, or a different client's seat be marked settled. */
  if (replaces_id && configured()) {
    const sb = await supabaseServer();
    const { data: prev } = await sb.from('placements')
      .select('id, client_id, ended_on, ended_reason').eq('id', String(replaces_id)).maybeSingle();
    const guaranteed = ENDED_REASONS.find(r => r.key === (prev as any)?.ended_reason)?.guaranteed;
    if (!prev || (prev as any).client_id !== client_id || !(prev as any).ended_on || !guaranteed)
      return NextResponse.json({
        error: 'A replacement has to replace an ended placement with the same executive that is owed one.'
      }, { status: 400 });
  }

  try {
    const id = await createPlacement(client_id, talent_id, started_on, replaces_id ?? null);
    if (cents != null && id) await setPlacementRate(id, cents);

    /* Both sides are told, and pointed at the two-week plan that has just
       been generated for them. Nine onboarding steps used to appear in an
       account neither person had been asked to open. */
    try {
      const on = fmtDate(started_on || todayInPacific());
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
  if (reason && !ENDED_REASONS.some(r => r.key === reason))
    return NextResponse.json({ error: 'that is not a reason we record' }, { status: 400 });
  if (ended_on && !/^\d{4}-\d{2}-\d{2}$/.test(String(ended_on)))
    return NextResponse.json({ error: 'that end date is not a date' }, { status: 400 });
  try {
    await endPlacement(id, ended_on, reason);
    /* Both sides hear that it has ended, in their own terms. */
    try {
      const pl = await getPlacement(id);
      if (pl) {
        const endedOn = fmtDate(ended_on ?? todayInPacific());
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
