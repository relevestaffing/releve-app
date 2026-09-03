import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getCalendar, forgetCalendar, noteCalendarError } from '@/lib/store';
import { busyIntervals, googleConfigured } from '@/lib/google-calendar';

export async function GET() {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const conn = await getCalendar(p.id);
  if (!conn) {
    /* Say which half is missing rather than a flat "not set up". Names only,
       never values — enough to fix it without a guessing game. */
    const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
      .filter(k => !process.env[k]);
    return NextResponse.json({
      connected: false, configured: googleConfigured(),
      missing: missing.length ? missing : undefined
    });
  }

  /* prove it still works, and report how many conflicts it is currently hiding */
  let busy = 0, error: string | null = null;
  try {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 10 * 86400000).toISOString();
    busy = (await busyIntervals(conn.refresh_token, from, to)).length;
  } catch (e: any) {
    error = e.message;
    await noteCalendarError(p.id, e.message);
  }
  return NextResponse.json({
    connected: true, configured: googleConfigured(),
    email: conn.email, connected_at: conn.connected_at, busy, error
  });
}

export async function DELETE() {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  await forgetCalendar(p.id);
  return NextResponse.json({ ok: true });
}
