import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';
import {
  getPlacement, listMessages, listPlacementMessages, listThreads,
  markThreadRead, personEmail, sendMessage
} from '@/lib/work';
import {
  managerEmailsFor, markRead, mineFor, myManagers, placementThread, placementThreadList,
  subjectThread, teamUnreadCount, unreadByThread
} from '@/lib/experience';
import { send, templates } from '@/lib/email';
import { WORDS } from '@/lib/words';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

/* Names for the people who wrote in a thread, so a bubble says who actually
   answered rather than a blanket "Relève". A client or talent only ever learns
   the name of their own assigned manager (through my_managers()); any other
   team member still reads as Relève. The console sees everyone's name. */
async function senderNames(me: { id: string; role: string }, senders: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!configured() || !senders.length) return out;
  if (me.role === 'admin') {
    const sb = await supabaseServer();
    const { data } = await sb.from('profiles').select('id, full_name, email').in('id', [...new Set(senders)]);
    for (const p of (data ?? []) as any[]) out[p.id] = (p.full_name ?? '').trim() || p.email;
    return out;
  }
  const mgrs = await myManagers(me as any);
  for (const m of mgrs) if (m.id && m.name) out[m.id] = m.name;
  return out;
}

export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const url = new URL(req.url);

  /* The nav badge. Small and cheap, polled while a page is open. */
  if (url.searchParams.get('unread')) {
    if (me.role === 'admin') return NextResponse.json({ total: await teamUnreadCount(), byThread: {} });
    const byThread = await unreadByThread();
    const total = Object.values(byThread).reduce((s, n) => s + n, 0);
    return NextResponse.json({ total, byThread });
  }

  const placementId = url.searchParams.get('placement');

  /* The direct line for a placement: client and talent talking to each
     other. Anyone else asking (a different client, a different talent) is
     turned away here rather than just getting an empty thread back from row
     level security. The console may read it, and does not mark it read: it
     is not their conversation. */
  if (placementId) {
    const p = await getPlacement(placementId);
    if (!p || (me.role !== 'admin' && p.client_id !== me.id && p.talent_id !== me.id))
      return NextResponse.json({ error: 'not your placement' }, { status: 403 });
    const messages = await listPlacementMessages(placementId);
    if (me.role !== 'admin') await markRead(me.id, placementThread(placementId));
    const names = await senderNames(me, messages.filter(m => m.from_team).map(m => m.sender_id));
    if (me.role === 'admin') {
      names[p.client_id] = p.client_name;
      names[p.talent_id] = p.talent_name;
    }
    return NextResponse.json({ messages, placement: placementId, names });
  }

  const asked = url.searchParams.get('subject');
  if (me.role === 'admin' && !asked) {
    const mine = url.searchParams.get('mine') === '1';
    const [threads, direct, scope] = await Promise.all([
      listThreads(), placementThreadList(), mine ? mineFor(me.id) : Promise.resolve(null)
    ]);
    return NextResponse.json({
      threads: scope
        ? threads.filter(t => scope.clients.has(t.subject_id) || scope.talent.has(t.subject_id))
        : threads,
      placementThreads: scope ? direct.filter(d => scope.placements.has(d.placement_id)) : direct
    });
  }
  const subject = me.role === 'admin' ? asked! : me.id;
  /* Opening a specific thread from the console is what marks it read for the
     team. A client or talent opening their own records it for themselves,
     which is what clears their badge. */
  if (me.role === 'admin') await markThreadRead(subject);
  else await markRead(me.id, subjectThread(me.id));
  const messages = await listMessages(subject);
  const names = await senderNames(me, messages.filter(m => m.from_team).map(m => m.sender_id));
  return NextResponse.json({ messages, subject, names });
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  /* Every other write route caps its text; this one did not, so a signed-in
     account could post an arbitrarily large body, repeatedly. */
  const body = String(b.body ?? '').trim().slice(0, 8000);
  if (!body) return NextResponse.json({ error: 'nothing to send' }, { status: 400 });
  const team = me.role === 'admin';
  const placementId = typeof b.placement_id === 'string' && b.placement_id ? b.placement_id : null;
  const preview = body.length > 180 ? body.slice(0, 180) + '…' : body;

  try {
    if (placementId) {
      const p = await getPlacement(placementId);
      if (!p || (!team && p.client_id !== me.id && p.talent_id !== me.id))
        return NextResponse.json({ error: 'not your placement' }, { status: 403 });

      /* A team member posting here is Relève stepping into the conversation,
         not one of the two sides; from_team marks that. */
      await sendMessage({ placement_id: placementId, sender_id: me.id, body, from_team: team });
      if (!team) await markRead(me.id, placementThread(placementId));

      /* Each recipient is named, and told who wrote, with a link straight to
         this conversation's tab. It used to arrive as "there, your account
         manager has replied" above a message from the executive. */
      const recipients = team
        ? [{ id: p.client_id, email: p.client_email, name: p.client_name }, { id: p.talent_id, email: p.talent_email, name: p.talent_name }]
        : me.id === p.client_id
          ? [{ id: p.talent_id, email: p.talent_email, name: p.talent_name }]
          : [{ id: p.client_id, email: p.client_email, name: p.client_name }];
      const from = team ? 'Relève' : ((me.full_name ?? '').trim() || me.email);
      for (const r of recipients) {
        if (!r.email) continue;
        const first = (r.name ?? '').trim().split(/\s+/)[0] || 'Hello';
        await send(r.email, templates.newMessage({
          name: first, from, preview, toTeam: false, kind: 'direct',
          href: `${SITE}/app/messages?tab=${placementId}`
        }));
      }
      return NextResponse.json({ ok: true });
    }

    const subject_id = team ? String(b.subject_id ?? '') : me.id;
    if (!subject_id) return NextResponse.json({ error: 'who is this to?' }, { status: 400 });
    await sendMessage({ subject_id, sender_id: me.id, body, from_team: team });
    if (!team) await markRead(me.id, subjectThread(me.id));

    /* Tell somebody. A message nobody is told about is a message nobody reads. */
    if (team) {
      const who = await personEmail(subject_id);
      if (who) {
        const sb = configured() ? await supabaseServer() : null;
        const { data: prof } = sb
          ? await sb.from('profiles').select('role').eq('id', subject_id).maybeSingle()
          : { data: null };
        const title = (prof as any)?.role === 'talent' ? WORDS.tsm : WORDS.csm;
        await send(who.email, templates.newMessage({
          name: who.name, from: `Your ${title}`, preview, toTeam: false, kind: 'manager',
          href: `${SITE}/app/messages?tab=sm`
        }));
      }
    } else {
      /* The assigned manager hears first; with nobody assigned, the whole
         team does, so nothing waits on an unowned inbox. */
      const from = (me.full_name ?? '').trim() || me.email;
      const role = me.role === 'client' ? 'client' : 'talent';
      for (const addr of await managerEmailsFor(me.id, role)) {
        await send(addr, templates.newMessage({
          name: 'Hello', from, preview, toTeam: true, kind: 'team',
          href: `${SITE}/console/messages?thread=${me.id}`
        }));
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
