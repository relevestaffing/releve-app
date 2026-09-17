import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getUnrevealedPlacement, markRevealSeen } from '@/lib/work';
import { safeMessage } from '@/lib/errors';

/* Either side's own click on "View Your Placement" — looks up their own
   unrevealed placement server-side rather than trusting an id from the
   client, then marks it seen for their side only through the one RPC
   that's allowed to touch these columns (placements are otherwise
   admin-write-only, see schema.sql). */
export async function POST() {
  const me = await currentProfile();
  if (!me || (me.role !== 'talent' && me.role !== 'client'))
    return NextResponse.json({ error: 'not signed in' }, { status: 403 });
  const side = me.role;

  const placement = await getUnrevealedPlacement(me.id, side);
  if (!placement) return NextResponse.json({ ok: true }); // already seen — nothing to do

  try {
    await markRevealSeen(placement.id, side);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
