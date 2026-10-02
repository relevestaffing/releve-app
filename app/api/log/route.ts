import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { listPlacementsFor } from '@/lib/work';
import { saveLog } from '@/lib/experience';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* The talent's end-of-day note: what got done, hours, anything in the way,
   and one highlight they may choose to share with their executive. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'talent') return NextResponse.json({ error: 'The daily log is for talent.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const placementId = typeof b.placement_id === 'string' ? b.placement_id : '';
  const mine = await listPlacementsFor(me.id);
  if (!mine.some(p => p.id === placementId))
    return NextResponse.json({ error: 'That placement is not one of yours.' }, { status: 403 });
  const day = String(b.log_date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: 'Which day is this for?' }, { status: 400 });

  let hours: number | null = null;
  if (b.hours !== '' && b.hours != null) {
    hours = Number(b.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24)
      return NextResponse.json({ error: 'Hours should be between 0 and 24.' }, { status: 400 });
    hours = Math.round(hours * 4) / 4;
  }
  const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null;
  const done = text(b.done_text, 4000);
  if (!done) return NextResponse.json({ error: 'Add a line on what got done.' }, { status: 400 });

  try {
    await saveLog({
      placement_id: placementId, talent_id: me.id, log_date: day,
      done_text: done, hours, blockers: text(b.blockers, 2000),
      highlight: text(b.highlight, 600), share_highlight: !!b.share_highlight
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
