import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { chat, type Msg } from '@/lib/ai/assistant';
import { recordProposals } from '@/lib/ai/actions';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

/* One turn with Relève's assistant. The client keeps the conversation; the
   server answers from the person's own seat. Proposals come back with ids
   once they are logged, so a confirm names a row, never a payload. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const raw: any[] = Array.isArray(b.messages) ? b.messages : [];
  const messages: Msg[] = raw
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.trim().slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user')
    return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });
  try {
    const out = await chat(me, messages);
    let proposals: Awaited<ReturnType<typeof recordProposals>> = [];
    let reply = out.reply;
    if (out.proposals.length) {
      try { proposals = await recordProposals(me.id, out.proposals); }
      catch (e: any) { reply += `\n\n${safeMessage(e)}`; }   // the answer still stands; the fix needs the log table
    }
    return NextResponse.json({ reply, proposals });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
