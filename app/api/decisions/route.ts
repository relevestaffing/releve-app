import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { setDecision, teamEmails } from '@/lib/work';
import { send, templates } from '@/lib/email';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'client') return NextResponse.json({ error: 'executives only' }, { status: 403 });
  const b = await req.json();
  if (!b.talent_id || !b.state) return NextResponse.json({ error: 'missing a decision' }, { status: 400 });
  try {
    await setDecision({
      client_id: me.id, talent_id: b.talent_id, state: b.state,
      reason: b.reason, note: b.note
    });
    if (b.state === 'shortlisted') {
      const who = me.full_name ?? me.email;
      for (const addr of await teamEmails()) {
        const tpl = templates.shortlisted({ name: 'there', who });
        await send(addr, tpl.subject, { text: tpl.text, html: tpl.html });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
