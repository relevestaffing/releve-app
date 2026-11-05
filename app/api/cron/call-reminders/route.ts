import { NextResponse } from 'next/server';
import { cronAllowed, cronClient } from '@/lib/cron-auth';
import { sendCallReminders } from '@/lib/call-reminders';

export const dynamic = 'force-dynamic';

/* Discovery-call reminders, 24 hours and 1 hour before (5 November 2026).
   The logic and the emails are in lib/call-reminders.ts. Called every fifteen
   minutes by netlify/functions/cron-call-reminders, guarded by the cron secret. */
export async function POST(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'no' }, { status: 401 });
  const sb = cronClient();
  if (!sb) return NextResponse.json({ error: 'not configured' }, { status: 500 });
  try {
    return NextResponse.json({ ok: true, ...(await sendCallReminders(sb)) });
  } catch (e: any) {
    console.error('[cron call-reminders]', e);
    return NextResponse.json({ error: e?.message ?? 'The reminders could not run.' }, { status: 500 });
  }
}
