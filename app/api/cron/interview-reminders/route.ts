import { NextResponse } from 'next/server';
import { send } from '@/lib/email';
import { experienceEmails } from '@/lib/email-experience';
import { cronAllowed, cronClient } from '@/lib/cron-auth';
import { tzLabel } from '@/lib/experience-public';

export const dynamic = 'force-dynamic';

/* Interview reminders, 24 hours and 1 hour before.
   ------------------------------------------------
   Called every fifteen minutes by netlify/functions/cron-interview-reminders.
   Each side gets the time in their own timezone, and the joining link. Every
   reminder is claimed in interview_reminders before it is sent, so a run that
   overlaps the last one, or a retry, can never send it twice.

   Windows: the day-before reminder goes between 20 and 24¼ hours ahead (an
   interview booked for this afternoon is not told "tomorrow"); the hour-before
   one between 0 and 75 minutes ahead. */
const H = 3_600_000;

function when(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: tz
    }).format(new Date(iso)) + ` (${tzLabel(tz)})`;
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles'
    }).format(new Date(iso)) + ' (Pacific)';
  }
}

export async function POST(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'no' }, { status: 401 });
  const sb = cronClient();
  if (!sb) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const now = Date.now();
  const { data: rows, error } = await sb.from('interviews')
    .select('id, client_id, talent_id, starts_at, status, meeting_url')
    .eq('status', 'Confirmed')
    .gt('starts_at', new Date(now).toISOString())
    .lte('starts_at', new Date(now + 24.25 * H).toISOString());
  if (error) { console.error('[cron interview-reminders]', error.message); return NextResponse.json({ error: 'read failed' }, { status: 500 }); }
  const list = (rows ?? []) as any[];
  if (!list.length) return NextResponse.json({ ok: true, due: 0, sent: 0 });

  const ids = [...new Set(list.flatMap(r => [r.client_id, r.talent_id]))];
  const [{ data: people }, { data: avail }] = await Promise.all([
    sb.from('profiles').select('id, full_name, email, timezone').in('id', ids),
    sb.from('availability').select('user_id, timezone').in('user_id', ids)
  ]);
  const by = new Map(((people ?? []) as any[]).map(p => [p.id, p]));
  const tzBy = new Map(((avail ?? []) as any[]).map(a => [a.user_id, a.timezone]));
  const tzOf = (id: string) => (by.get(id)?.timezone as string) || (tzBy.get(id) as string) || 'America/Los_Angeles';

  let sent = 0, skipped = 0;
  for (const iv of list) {
    const ahead = Date.parse(iv.starts_at) - now;
    const kind: '24h' | '1h' | null =
      ahead <= 1.25 * H ? '1h' : (ahead >= 20 * H && ahead <= 24.25 * H) ? '24h' : null;
    if (!kind) continue;

    const { error: claim } = await sb.from('interview_reminders').insert({ interview_id: iv.id, kind });
    if (claim) { skipped++; continue; }           // already sent (or the table is missing): never twice

    const client = by.get(iv.client_id), talent = by.get(iv.talent_id);
    const pairs: [any, any][] = [[client, talent], [talent, client]];
    for (const [to, other] of pairs) {
      if (!to?.email) continue;
      const first = String(to.full_name ?? '').trim().split(/\s+/)[0] || 'Hello';
      const withWhom = String(other?.full_name ?? '').trim() || (to === client ? 'your candidate' : 'the executive');
      const ok = await send(to.email, experienceEmails.interviewReminder({
        name: first, withWhom, when: when(iv.starts_at, tzOf(to.id)), url: iv.meeting_url ?? null, soon: kind
      }));
      if (ok) sent++;
    }
  }
  return NextResponse.json({ ok: true, due: list.length, sent, skipped });
}
