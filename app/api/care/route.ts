import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { send, templates } from '@/lib/email';
import { personEmail, teamEmails, getPlacement } from '@/lib/work';
import { dayLabel } from '@/lib/money-public';
import { safeMessage } from '@/lib/errors';
import {
  assignManagers, decideTimeOff, endPlacementWithReason, markFeedbackSeen,
  markFirstCandidate, recordOutcome, requestTimeOff, savePulse, saveFeedback,
  setTeamRole, shareFeedback, tickStep
} from '@/lib/care';

export const dynamic = 'force-dynamic';

/* One door for the care layer. Each action names who may take it; the database
   policies say the same thing again, so a mistake here is not the last line
   of defence. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'sign in first' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? '');
  const team = me.role === 'admin';

  try {
    switch (action) {
      /* ---- the executive's monthly pulse: the client fills it in ---- */
      case 'pulse': {
        if (me.role !== 'client' && !team)
          return NextResponse.json({ error: 'the executive fills this in' }, { status: 403 });
        const going = Number(b.going);
        if (!Number.isInteger(going) || going < 1 || going > 5)
          return NextResponse.json({ error: 'Pick how it’s going.' }, { status: 400 });
        await savePulse({
          placement_id: String(b.placement_id), going, workload: b.workload,
          standout: b.standout, friction: b.friction, keep_going: !!b.keep_going
        });
        return NextResponse.json({ ok: true });
      }

      /* ---- time off: talent ask, Relève decides ---- */
      case 'time_off_request': {
        await requestTimeOff({
          placement_id: String(b.placement_id),
          starts_on: String(b.starts_on), ends_on: String(b.ends_on), reason: b.reason
        });
        /* Cover has to be arranged before the day — which only happens if the
           person arranging it hears. Used to write the row and tell nobody. */
        try {
          const talent = me.full_name ?? me.email;
          for (const t of await teamEmails())
            await send(t, templates.timeOffRequested({
              talent, from: dayLabel(String(b.starts_on)), to: dayLabel(String(b.ends_on)), reason: b.reason ?? null }));
        } catch { /* the request stands */ }
        return NextResponse.json({ ok: true });
      }

      case 'time_off_decide': {
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        const row = await decideTimeOff(String(b.id), b.state, b.cover_note);
        /* The talent used to learn the answer only by reopening the page. */
        if (row && (b.state === 'approved' || b.state === 'declined')) {
          try {
            const pl = await getPlacement(row.placement_id);
            const who = pl ? await personEmail(pl.talent_id) : null;
            if (who?.email) await send(who.email, templates.timeOffDecided({
              name: who.name, from: dayLabel(row.starts_on), to: dayLabel(row.ends_on),
              approved: b.state === 'approved', cover: row.cover_note }));
          } catch { /* the decision stands */ }
        }
        return NextResponse.json({ ok: true });
      }

      /* ---- the first fortnight: console only, from here on ---- */
      case 'step':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await tickStep(String(b.id), !!b.done);
        return NextResponse.json({ ok: true });

      /* ---- feedback ---- */
      case 'feedback_save':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        if (!String(b.strengths ?? '').trim())
          return NextResponse.json({ error: 'Say what they’re doing well first.' }, { status: 400 });
        await saveFeedback(b);
        return NextResponse.json({ ok: true });

      case 'feedback_share': {
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        const fb = await shareFeedback(String(b.id), !!b.shared);
        /* Shared deliberately — and told deliberately. */
        if (fb?.shared) {
          try {
            const who = await personEmail(fb.talent_id);
            if (who?.email) await send(who.email, templates.feedbackShared({ name: who.name, period: fb.period }));
          } catch { /* it is shared either way */ }
        }
        return NextResponse.json({ ok: true });
      }

      case 'feedback_seen': {
        const seen = await markFeedbackSeen(String(b.id));
        return NextResponse.json({ ok: true, seen });
      }

      /* ---- calibration ---- */
      case 'outcome': {
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        const score = Number(b.outcome_score);
        if (!Number.isInteger(score) || score < 0 || score > 100)
          return NextResponse.json({ error: 'Score it out of 100.' }, { status: 400 });
        await recordOutcome(String(b.placement_id), {
          outcome_score: score, retained: !!b.retained, note: b.note
        });
        return NextResponse.json({ ok: true });
      }

      /* ---- the guarantee ---- */
      case 'first_candidate':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await markFirstCandidate(String(b.search_id), b.on);
        return NextResponse.json({ ok: true });

      case 'end_placement': {
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await endPlacementWithReason(String(b.placement_id), b.reason, b.on);
        /* Both sides hear that it has ended, in their own terms. */
        try {
          const pl = await getPlacement(String(b.placement_id));
          if (pl) {
            const endedOn = dayLabel(b.on ?? new Date().toISOString().slice(0, 10));
            const [exec, talent] = await Promise.all([personEmail(pl.client_id), personEmail(pl.talent_id)]);
            if (exec?.email && talent) await send(exec.email, templates.placementEnded({ name: exec.name, withWhom: talent.full, endedOn, side: 'client' }));
            if (talent?.email && exec) await send(talent.email, templates.placementEnded({ name: talent.name, withWhom: exec.full, endedOn, side: 'talent' }));
          }
        } catch { /* it has ended either way */ }
        return NextResponse.json({ ok: true });
      }

      /* ---- notice, given by the executive themselves ---- */
      /* Thirty days' written notice is the one contractual action a
         month-to-month customer must be able to take from their own account.
         give_notice() checks the placement is theirs and still running. */
      case 'give_notice': {
        if (me.role !== 'client') return NextResponse.json({ error: 'the executive gives notice' }, { status: 403 });
        if (!configured()) return NextResponse.json({ ok: true, ends_on: null, note: 'Preview mode' });
        const sb = await supabaseServer();
        const { data: on, error } = await sb.rpc('give_notice', { p_placement: String(b.placement_id) });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        /* give_notice now stores the true end date — the first Monday of the
           following month, matching the written terms and the boundary billing
           runs on. Read it back rather than recomputing a different rule here. */
        const { data: term } = await sb.from('my_placement_terms')
          .select('notice_ends_on').eq('placement_id', String(b.placement_id)).maybeSingle();
        const endsOn = dayLabel((term as any)?.notice_ends_on ?? String(on));
        try {
          const pl = await getPlacement(String(b.placement_id));
          const who = me.full_name ?? me.email;
          for (const t of await teamEmails())
            await send(t, templates.noticeGiven({ name: 'there', who: `${who}${pl ? ` (${pl.talent_name})` : ''}`, endsOn, toTeam: true }));
          await send(me.email, templates.noticeGiven({ name: (me.full_name ?? '').split(' ')[0] || 'there', who, endsOn, toTeam: false }));
        } catch { /* the notice stands */ }
        return NextResponse.json({ ok: true, notice_given_on: on, ends_on: endsOn });
      }

      /* ---- the team ---- */
      case 'team_role':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await setTeamRole(String(b.user_id), b.team_role);
        return NextResponse.json({ ok: true });

      case 'assign_managers':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await assignManagers(String(b.placement_id), b.csm_id ?? null, b.tsm_id ?? null);
        return NextResponse.json({ ok: true });

      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
