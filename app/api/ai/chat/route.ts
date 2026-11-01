import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { chatStream, greet, recentThread, type Msg, type ChatEvent } from '@/lib/ai/assistant';
import { recordProposals } from '@/lib/ai/actions';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

/* Opening the window: the greeting and the last few exchanges, so the
   conversation picks up where it left off rather than starting blank. */
export async function GET() {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const [greeting, thread] = await Promise.all([greet(me), recentThread(me).catch(() => [])]);
  return NextResponse.json({ greeting, thread });
}

/* One turn with Relève's assistant, streamed as newline-separated JSON:
   { t: 'text', d } as the words arrive, { t: 'status', d } while a lookup
   runs, and { t: 'done', reply, proposals } at the end, proposals carrying
   their log ids so a confirm names a row, never a payload. A client that
   does not ask for a stream gets the finished JSON instead. */
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

  const wantsStream = (req.headers.get('accept') ?? '').includes('application/x-ndjson') || b.stream === true;

  if (!wantsStream) {
    try {
      const out = await chatStream(me, messages, () => {});
      let proposals: Awaited<ReturnType<typeof recordProposals>> = [];
      let reply = out.reply;
      if (out.proposals.length) {
        try { proposals = await recordProposals(me.id, out.proposals); }
        catch (e: any) { reply += `\n\n${safeMessage(e)}`; }
      }
      return NextResponse.json({ reply, proposals });
    } catch (e: any) {
      return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (e: any) => { try { controller.enqueue(enc.encode(JSON.stringify(e) + '\n')); } catch { /* closed */ } };
      try {
        const out = await chatStream(me, messages, (e: ChatEvent) => push(e));
        let proposals: any[] = [];
        let note = '';
        if (out.proposals.length) {
          try { proposals = await recordProposals(me.id, out.proposals); }
          catch (e: any) { note = safeMessage(e); push({ t: 'text', d: `\n\n${note}` }); }
        }
        push({ t: 'done', reply: note ? `${out.reply}\n\n${note}` : out.reply, proposals });
      } catch (e: any) {
        push({ t: 'error', d: safeMessage(e) });
      }
      try { controller.close(); } catch { /* closed */ }
    }
  });
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' }
  });
}
