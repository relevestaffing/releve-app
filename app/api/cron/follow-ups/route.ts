import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { send, templates } from '@/lib/email';
import { teamEmails } from '@/lib/work';
import { todayInPacific } from '@/lib/money-public';
import { stageLabel, followUpDue } from '@/lib/prospects-public';
import type { Prospect } from '@/lib/prospects-public';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* How late a lead's follow-up is, in words. Due today reads as such; anything
   earlier is counted in whole days. */
function overdueLabel(nextFollowUp: string, today: string) {
  if (nextFollowUp >= today) return 'due today';
  const days = Math.round(
    (Date.parse(today + 'T00:00:00Z') - Date.parse(nextFollowUp + 'T00:00:00Z')) / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} overdue`;
}

/* The team's leads, in their inbox (weekday mornings).
   ----------------------------------------------------
   A lead with a follow-up date that has arrived is a lead going cold on a
   board nobody opened. This lists the open ones owed a touch today, most
   overdue first, and emails the team once. Nothing due means nothing sent:
   an empty inbox is the right state, not a letter saying so. Called by a
   scheduled task, guarded by the cron secret, and reads with the service
   role because no signed-in person could see every lead. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('[cron] missing', !url ? 'NEXT_PUBLIC_SUPABASE_URL' : 'the Supabase service key');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const today = todayInPacific();

  /* Read with the service role, not a user session: the cron has none.
     Guarded so a missing next_follow_up column before part51 runs returns
     nothing rather than a 500. */
  let due: Prospect[] = [];
  try {
    const { data, error } = await sb.from('prospects').select('*')
      .not('stage', 'in', '("won","lost")')
      .not('next_follow_up', 'is', null)
      .lte('next_follow_up', today)
      .order('next_follow_up', { ascending: true });
    if (!error) due = ((data ?? []) as Prospect[]).filter(p => followUpDue(p, today));
  } catch { due = []; }

  if (!due.length) return NextResponse.json({ ok: true, sent: 0 });

  const leads = due.map(p => ({
    name: p.full_name, company: p.org_name, stage: stageLabel(p.stage),
    overdue: overdueLabel(p.next_follow_up as string, today)
  }));

  let sent = 0;
  for (const to of await teamEmails())
    if (await send(to, templates.followUps({ leads }))) sent++;

  return NextResponse.json({ ok: true, sent });
}
