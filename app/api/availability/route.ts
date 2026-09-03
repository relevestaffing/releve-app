import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getAvailability, setAvailability } from '@/lib/store';

export async function GET() {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  return NextResponse.json(await getAvailability(p.id));
}
export async function POST(req: Request) {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { timezone, windows } = await req.json();
  await setAvailability(p.id, timezone, windows);
  return NextResponse.json({ ok: true });
}
