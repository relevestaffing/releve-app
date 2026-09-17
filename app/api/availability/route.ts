import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getAvailability, setAvailability } from '@/lib/store';
import { safeMessage } from '@/lib/errors';

/* Every weekday window in minutes-from-midnight, 0–6 and 0–1440 — the same
   shape scheduling.ts's own Window type promises everywhere else it is read.
   Nothing upstream checked this before it reached the database; a malformed
   body here used to throw wherever it was next read instead of at the door. */
function validWindows(w: unknown): w is { weekday: number; start_min: number; end_min: number }[] {
  return Array.isArray(w) && w.every(x =>
    x && typeof x === 'object'
    && Number.isInteger(x.weekday) && x.weekday >= 0 && x.weekday <= 6
    && Number.isInteger(x.start_min) && x.start_min >= 0 && x.start_min < 1440
    && Number.isInteger(x.end_min) && x.end_min > x.start_min && x.end_min <= 1440);
}

export async function GET() {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  return NextResponse.json(await getAvailability(p.id));
}
export async function POST(req: Request) {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b.timezone !== 'string' || !b.timezone.trim())
    return NextResponse.json({ error: 'which timezone?' }, { status: 400 });
  if (!validWindows(b.windows))
    return NextResponse.json({ error: 'that does not look like a set of availability windows' }, { status: 400 });
  try {
    await setAvailability(p.id, b.timezone, b.windows);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
