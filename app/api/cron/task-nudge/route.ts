import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { send, templates } from '@/lib/email';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* Overdue tasks, handled like a good manager would.
   ------------------------------------------------
   Once a day: a task a day or more past its date, not finished and not
   waiting on the executive, earns the talent one quiet note (one per task,
   ever: nudged_on). Two days past, Relève hears about it too (escalated_on),
   so the Talent Success Manager can step in before the executive has to
   chase. Nothing goes to the executive from here: the overdue state is
   already visible at the top of their list, and a nagging email about their
   own assistant is not the Relève experience. Runs with the service role,
   guarded by the cron secret. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'not configured' }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

  const { data: rows } = await sb.from('tasks')
    .select('id, title, due_on, status, nudged_on, escalated_on, placement_id, created_by, placement:placement_id(client_id, talent_id, ended_on, client:client_id(full_name), talent:talent_id(full_name, email))')
    .eq('done', false).not('due_on', 'is', null).lte('due_on', yesterday)
    .in('status', ['todo', 'in_progress']);

  let nudged = 0, escalated = 0;
  const teamNotes: { talent: string; executive: string; title: string; due: string }[] = [];
  for (const t of (rows ?? []) as any[]) {
    const p = t.placement;
    if (!p || p.ended_on) continue;
    const talentEmail = p.talent?.email as string | undefined;
    const talentName = ((p.talent?.full_name as string) ?? '').split(/\s+/)[0] || 'there';
    const execName = (p.client?.full_name as string) ?? 'your executive';

    if (!t.nudged_on && talentEmail) {
      const ok = await send(talentEmail, templates.taskOverdue({ name: talentName, title: t.title, due: t.due_on, executive: execName }));
      if (ok) { nudged++; await sb.from('tasks').update({ nudged_on: today }).eq('id', t.id); }
    }
    if (!t.escalated_on && t.due_on <= twoDaysAgo) {
      teamNotes.push({ talent: (p.talent?.full_name as string) ?? 'Talent', executive: execName, title: t.title, due: t.due_on });
      await sb.from('tasks').update({ escalated_on: today }).eq('id', t.id);
      escalated++;
    }
  }

  if (teamNotes.length) {
    const { data: team } = await sb.from('profiles').select('email').eq('role', 'admin').is('archived_at', null);
    for (const m of (team ?? []) as any[]) {
      if (m.email) await send(m.email, templates.tasksOverdueTeam({ items: teamNotes })).catch(() => false);
    }
  }
  return NextResponse.json({ ok: true, today, nudged, escalated });
}
