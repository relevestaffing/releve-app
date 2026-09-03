import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { saveSearch } from '@/lib/store';

/* The Relève team records what a client is hiring for. Clients never post here —
   the brief comes off the intro call, not out of a form they fill in themselves. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (configured() && me.role !== 'admin') return NextResponse.json({ error: 'not allowed' }, { status: 403 });

  const { client_key, pending, ...patch } = await req.json();
  if (!client_key) return NextResponse.json({ error: 'no client' }, { status: 400 });

  const allowed = ['role_title', 'scope', 'hours', 'tools', 'target_at', 'stage'];
  const clean: Record<string, unknown> = {};
  allowed.forEach(k => { if (k in patch) clean[k] = patch[k]; });

  await saveSearch(client_key, clean, !!pending);
  return NextResponse.json({ ok: true });
}
