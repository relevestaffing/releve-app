import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { listCheckins, saveCheckin, teamEmails, weekEnding } from '@/lib/work';
import { send, templates } from '@/lib/email';

export async function GET() {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  /* Relève sees every check-in; a talent sees only their own. Row level
     security enforces this too — the filter is for a smaller payload. */
  const checkins = await listCheckins(me.role === 'admin' ? {} : { talentId: me.id });
  return NextResponse.json({ checkins, week: weekEnding() });
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'talent') return NextResponse.json({ error: 'check-ins are filed by talent' }, { status: 403 });
  const b = await req.json();
  if (!b.placement_id) return NextResponse.json({ error: 'which placement?' }, { status: 400 });
  try {
    await saveCheckin({
      placement_id: b.placement_id,
      talent_id: me.id,
      week_ending: b.week_ending || weekEnding(),
      shipped: b.shipped, blocked: b.blocked,
      rapport: b.rapport ? Number(b.rapport) : null,
      workload: b.workload, note: b.note
    });
    /* The trigger decides what counts as a flag; mirror it here so the
       alert goes out at the same moment the row is written. */
    const blocked = String(b.blocked ?? '').trim();
    const flagged = Boolean(blocked) || Number(b.rating ?? b.rapport ?? 5) <= 2 || b.workload === 'heavy';
    if (flagged) {
      const why = blocked ? `Blocked: ${blocked}`
        : b.workload === 'heavy' ? 'Reported the workload as unsustainable'
        : 'Rated the working relationship 2 or below';
      for (const addr of await teamEmails()) {
        const tpl = templates.checkinFlagged({ talent: me.full_name ?? me.email, why });
        await send(addr, tpl);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
