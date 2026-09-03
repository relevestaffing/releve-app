import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
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
        const going = Number(b.going);
        if (!Number.isInteger(going) || going < 1 || going > 5)
          return NextResponse.json({ error: 'pick how it is going' }, { status: 400 });
        await savePulse({
          placement_id: String(b.placement_id), going, workload: b.workload,
          standout: b.standout, friction: b.friction, keep_going: !!b.keep_going
        });
        return NextResponse.json({ ok: true });
      }

      /* ---- time off: talent ask, Relève decides ---- */
      case 'time_off_request':
        await requestTimeOff({
          placement_id: String(b.placement_id),
          starts_on: String(b.starts_on), ends_on: String(b.ends_on), reason: b.reason
        });
        return NextResponse.json({ ok: true });

      case 'time_off_decide':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await decideTimeOff(String(b.id), b.state, b.cover_note);
        return NextResponse.json({ ok: true });

      /* ---- the first fortnight: either side ticks their own steps ---- */
      case 'step':
        await tickStep(String(b.id), !!b.done);
        return NextResponse.json({ ok: true });

      /* ---- feedback ---- */
      case 'feedback_save':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        if (!String(b.strengths ?? '').trim())
          return NextResponse.json({ error: 'say what they are doing well first' }, { status: 400 });
        await saveFeedback(b);
        return NextResponse.json({ ok: true });

      case 'feedback_share':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await shareFeedback(String(b.id), !!b.shared);
        return NextResponse.json({ ok: true });

      case 'feedback_seen':
        await markFeedbackSeen(String(b.id));
        return NextResponse.json({ ok: true });

      /* ---- calibration ---- */
      case 'outcome': {
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        const score = Number(b.outcome_score);
        if (!Number.isInteger(score) || score < 0 || score > 100)
          return NextResponse.json({ error: 'score it out of 100' }, { status: 400 });
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

      case 'end_placement':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await endPlacementWithReason(String(b.placement_id), b.reason, b.on);
        return NextResponse.json({ ok: true });

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
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
