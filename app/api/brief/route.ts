import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getPlacement } from '@/lib/work';
import { saveBrief } from '@/lib/experience';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* The executive's briefing for their talent: tools, access, preferences.
   Written by the executive on the placement or by Relève; read by the talent. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const placementId = typeof b.placement_id === 'string' ? b.placement_id : '';
  const p = placementId ? await getPlacement(placementId) : null;
  if (!p || (me.role !== 'admin' && p.client_id !== me.id))
    return NextResponse.json({ error: 'Only the executive on this placement, or Relève, can write the briefing.' }, { status: 403 });
  try {
    await saveBrief(placementId, me.id, {
      tools: b.tools, access: b.access, preferences: b.preferences, rhythm: b.rhythm, ask_first: b.ask_first
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
