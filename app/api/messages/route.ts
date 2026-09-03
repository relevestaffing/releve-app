import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { listMessages, listThreads, personEmail, sendMessage, teamEmails } from '@/lib/work';
import { send, templates } from '@/lib/email';

export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const asked = new URL(req.url).searchParams.get('subject');
  if (me.role === 'admin' && !asked) return NextResponse.json({ threads: await listThreads() });
  const subject = me.role === 'admin' ? asked! : me.id;
  return NextResponse.json({ messages: await listMessages(subject), subject });
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json();
  const body = String(b.body ?? '').trim();
  if (!body) return NextResponse.json({ error: 'nothing to send' }, { status: 400 });
  const team = me.role === 'admin';
  const subject_id = team ? b.subject_id : me.id;
  if (!subject_id) return NextResponse.json({ error: 'who is this to?' }, { status: 400 });
  try {
    await sendMessage({ subject_id, sender_id: me.id, body, from_team: team });

    /* Tell somebody. A message nobody is told about is a message nobody reads. */
    const preview = body.length > 180 ? body.slice(0, 180) + '…' : body;
    if (team) {
      const who = await personEmail(subject_id);
      if (who) await send(who.email, ...(() => {
        const tpl = templates.newMessage({ name: who.name, from: 'Relève', preview, toTeam: false });
        return [tpl.subject, { text: tpl.text, html: tpl.html }] as const;
      })());
    } else {
      const from = me.full_name ?? me.email;
      for (const addr of await teamEmails()) {
        const tpl = templates.newMessage({ name: 'there', from, preview, toTeam: true });
        await send(addr, tpl.subject, { text: tpl.text, html: tpl.html });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
