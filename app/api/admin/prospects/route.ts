import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { saveProspect, setProspectStage, importProspectsFromCalendar } from '@/lib/prospects';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

/* Create or edit one prospect. */
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  if (b.action === 'import') {
    try { return NextResponse.json({ ok: true, ...(await importProspectsFromCalendar()) }); }
    catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }
  const full_name = String(b.full_name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!full_name) return NextResponse.json({ error: 'What is their name?' }, { status: 400 });
  if (!email.includes('@')) return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });
  try {
    const id = await saveProspect({
      id: b.id || undefined, full_name, email,
      org_name: b.org_name, source: b.source, call_at: b.call_at || null, note: b.note
    });
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}

/* Move one prospect along. */
export async function PATCH(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? ''); const stage = String(b.stage ?? '');
  if (!id || !['booked','held','proposal','won','lost'].includes(stage))
    return NextResponse.json({ error: 'Which prospect, to which stage?' }, { status: 400 });
  try {
    await setProspectStage(id, stage as any, { lost_reason: b.lost_reason, note: b.note });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
