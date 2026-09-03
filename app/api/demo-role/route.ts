import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { configured } from '@/lib/supabase/server';
import { resetDemo } from '@/lib/store';

/* Demo mode only: switch which account you are previewing, and optionally
   put the sample data back to how it started. */
export async function POST(req: Request) {
  if (configured()) return NextResponse.json({ error: 'not available' }, { status: 400 });
  const { role, reset } = await req.json();
  const store = await cookies();
  store.set('releve_demo_role', role ?? 'client', { path: '/' });
  if (reset) { resetDemo(); store.delete('releve_demo_new_side'); }
  return NextResponse.json({ ok: true });
}
