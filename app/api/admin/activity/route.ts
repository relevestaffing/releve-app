import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { listActivity, logActivity, notifyTeam, type SubjectType } from '@/lib/activity';
import { logTouch } from '@/lib/prospects';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const TYPES: SubjectType[] = ['prospect', 'client', 'talent'];
const KINDS = ['note', 'call', 'email', 'message', 'meeting'];

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

/* The timeline for one lead, executive or talent. */
export async function GET(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const u = new URL(req.url);
  const type = u.searchParams.get('type') as SubjectType;
  const id = u.searchParams.get('id') ?? '';
  if (!TYPES.includes(type) || !id) return NextResponse.json({ error: 'Whose history?' }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...(await listActivity(type, id)) }); }
  catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
}

/* Add to it: a note (with @mentions) or a touch. A lead's calls, emails,
   messages and meetings go where they always have (prospect_touches), so
   "last touched" and the follow-up date move with them. */
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const type = b.type as SubjectType;
  const id = String(b.id ?? '');
  const kind = String(b.kind ?? 'note');
  const body = String(b.body ?? '').trim();
  const mentions: string[] = Array.isArray(b.mentions) ? b.mentions.map(String).slice(0, 20) : [];
  const next = b.next_follow_up ? String(b.next_follow_up) : null;
  if (!TYPES.includes(type) || !id) return NextResponse.json({ error: 'Whose history?' }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'What kind of entry?' }, { status: 400 });
  if (!body && kind === 'note') return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
  const by = g.p!.id;
  try {
    let stored = false;
    if (type === 'prospect' && kind !== 'note') {
      await logTouch({ prospect_id: id, kind: kind as any, note: body, next_follow_up: next, by });
      stored = true;
      if (mentions.length) await logActivity({ type, id, kind: 'note', body, mentions, by, meta: { with: kind } });
    } else {
      stored = await logActivity({ type, id, kind: kind as any, body, mentions, by });
      if (!stored && type === 'prospect') { await logTouch({ prospect_id: id, kind: 'note', note: body, next_follow_up: next, by }); stored = true; }
    }
    if (!stored) return NextResponse.json({ error: 'The history is not set up yet. Run the one-time setup (part 59) and try again.' }, { status: 409 });
    if (mentions.length) {
      const who = (g.p as any).full_name || 'Someone';
      const subject = String(b.subject_name ?? '').slice(0, 80) || 'a record';
      const url = type === 'prospect' ? `/console/prospects?open=${encodeURIComponent(id)}`
        : type === 'client' ? `/console/people?open=${encodeURIComponent(id)}` : `/console/bench?open=${encodeURIComponent(id)}`;
      await notifyTeam(mentions, by, { title: `${who} mentioned you on ${subject}`, body: body.slice(0, 140), url });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
