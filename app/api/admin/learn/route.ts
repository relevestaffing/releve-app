import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';
import { safeMessage } from '@/lib/errors';
import { send } from '@/lib/email';
import { COURSES, IN_APP_COURSES, isCourse, VIDEO_RE, type CourseKey, type Step } from '@/lib/learn-courses';
import { learnLink, newToken } from '@/lib/learn';
import { learnInvite } from '@/lib/learn-email';

export const dynamic = 'force-dynamic';

/* Team trainings, from the console (The business, Training).
   POST   send a training to someone: a private link, by email
   PATCH  { id, action: 'resend' | 'withdraw' } on one person's link
   PUT    { course, videos } the lesson videos for a course
   The Relève team only; the database checks again (is_admin() policies). */

async function team() {
  const me = await currentProfile();
  if (!me || me.role !== 'admin')
    return { error: NextResponse.json({ error: 'Relève team only' }, { status: 403 }) } as const;
  if (!configured()) return { error: NextResponse.json({ error: 'The console is in demo mode.' }, { status: 400 }) } as const;
  return { me, sb: await supabaseServer() } as const;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const gate = await team(); if ('error' in gate) return gate.error;
  const { me, sb } = gate;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const email = String(b.email ?? '').trim().toLowerCase().slice(0, 200);
  const ck: unknown = b.course;
  const course: CourseKey = isCourse(ck) ? ck : 'inside';
  if (IN_APP_COURSES.includes(course)) return NextResponse.json({ error: `${COURSES[course].title} opens from the professional’s own app account, on their checklist. There is nothing to send.` }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: 'Please give their name.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });

  const { data: live } = await sb.from('team_trainings').select('id')
    .eq('course', course).ilike('email', email.replace(/[%_\\]/g, m => '\\' + m)).is('revoked_at', null).limit(1);
  if (live?.length) return NextResponse.json({ error: `${name} already has a live ${COURSES[course].title} link. Use Resend on their row.` }, { status: 409 });

  const token = newToken();
  const { error } = await sb.from('team_trainings').insert({
    course, name, email, token, sent_by: me.id, sent_at: new Date().toISOString()
  });
  if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });

  const sent = await send(email, learnInvite({ name, course, link: learnLink(token) }));
  if (!sent)
    return NextResponse.json({ ok: true, warning: 'Saved, but the email did not send. Use Resend on their row.' });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const gate = await team(); if ('error' in gate) return gate.error;
  const { sb } = gate;
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? '');
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown training link.' }, { status: 400 });
  const { data: row } = await sb.from('team_trainings').select('id, course, name, email, token, revoked_at').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Unknown training link.' }, { status: 404 });

  if (b.action === 'withdraw') {
    const { error } = await sb.from('team_trainings').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'resend') {
    if ((row as any).revoked_at) return NextResponse.json({ error: 'That link was withdrawn. Send the training again instead.' }, { status: 400 });
    const course = isCourse((row as any).course) ? (row as any).course : 'inside';
    const sent = await send((row as any).email, learnInvite({ name: (row as any).name, course, link: learnLink((row as any).token), again: true }));
    if (!sent) return NextResponse.json({ error: 'The email did not send. Check the email log on the Team page.' }, { status: 502 });
    await sb.from('team_trainings').update({ sent_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

export async function PUT(req: Request) {
  const gate = await team(); if ('error' in gate) return gate.error;
  const { sb } = gate;
  const b = await req.json().catch(() => ({}));
  const ck: unknown = b.course;
  if (!isCourse(ck)) return NextResponse.json({ error: 'Unknown training.' }, { status: 400 });
  const steps: readonly Step[] = COURSES[ck].steps;
  const ids = new Set(steps.filter(s => s[4] === 'l').map(s => s[0]));
  const videos: Record<string, string> = {};
  for (const [k, v] of Object.entries((b.videos ?? {}) as Record<string, unknown>)) {
    const u = String(v ?? '').trim();
    if (!u || !ids.has(k)) continue;
    if (!VIDEO_RE.test(u)) {
      const t = steps.find(s => s[0] === k)?.[2] ?? k;
      return NextResponse.json({ error: `The video for “${t}” needs a YouTube, Vimeo or Loom link.` }, { status: 400 });
    }
    videos[k] = u.slice(0, 300);
  }
  const { error } = await sb.from('content_settings')
    .upsert({ key: `learn:videos:${ck}`, value: videos, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
  return NextResponse.json({ ok: true });
}
