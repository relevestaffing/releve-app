import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import {
  saveProspect, setProspectStage, setProspectOwner, setProspectFollowUp,
  logTouch, listTouches, importProspectsFromCalendar
} from '@/lib/prospects';
import { safeMessage } from '@/lib/errors';

const STAGES = ['new', 'contacted', 'nurturing', 'booked', 'held', 'proposal', 'won', 'lost'];

export const dynamic = 'force-dynamic';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

/* The touch history for one lead, for the touch panel. */
export async function GET(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'Which lead?' }, { status: 400 });
  try { return NextResponse.json({ ok: true, touches: await listTouches(id) }); }
  catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
}

/* Create or edit one lead, pull from the calendar, or log a touch. */
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  if (b.action === 'import') {
    try { return NextResponse.json({ ok: true, ...(await importProspectsFromCalendar()) }); }
    catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }
  if (b.action === 'touch') {
    const prospect_id = String(b.prospect_id ?? '');
    const kind = String(b.kind ?? 'note');
    if (!prospect_id) return NextResponse.json({ error: 'Which lead?' }, { status: 400 });
    if (!['note', 'call', 'email', 'message', 'meeting'].includes(kind))
      return NextResponse.json({ error: 'What kind of touch?' }, { status: 400 });
    try {
      await logTouch({ prospect_id, kind: kind as any, note: b.note, next_follow_up: b.next_follow_up || null, by: g.p?.id });
      return NextResponse.json({ ok: true });
    } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }
  const full_name = String(b.full_name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!full_name) return NextResponse.json({ error: 'What is their name?' }, { status: 400 });
  if (!email.includes('@')) return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });
  try {
    const id = await saveProspect({
      id: b.id || undefined, full_name, email,
      org_name: b.org_name, source: b.source, call_at: b.call_at || null, note: b.note, website: b.website
    });
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}

/* Edit one lead in place: any of stage, owner or next follow-up, each applied
   only when its field is present in the body, so a single cell can change on
   its own. */
export async function PATCH(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? '');
  if (!id) return NextResponse.json({ error: 'Which lead?' }, { status: 400 });

  const hasStage = b.stage !== undefined;
  const hasOwner = 'owner_id' in b;
  const hasFollow = 'next_follow_up' in b;
  if (!hasStage && !hasOwner && !hasFollow)
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  if (hasStage && !STAGES.includes(String(b.stage)))
    return NextResponse.json({ error: 'That is not a stage.' }, { status: 400 });

  try {
    if (hasStage) await setProspectStage(id, String(b.stage) as any, { lost_reason: b.lost_reason, note: b.note });
    if (hasOwner) await setProspectOwner(id, b.owner_id || null);
    if (hasFollow) await setProspectFollowUp(id, b.next_follow_up || null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
