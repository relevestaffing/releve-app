import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { saveSearch, setSearchOpen } from '@/lib/store';
import { safeMessage } from '@/lib/errors';

/* The Relève team records what a client is hiring for. Clients never post here —
   the brief comes off the intro call, not out of a form they fill in themselves. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'admin') return NextResponse.json({ error: 'not allowed' }, { status: 403 });

  const { client_key, pending, action, reason, ...patch } = await req.json();
  if (!client_key) return NextResponse.json({ error: 'no client' }, { status: 400 });

  /* Opening and closing is separate from editing the brief, because it
     changes what the executive's account is: with a search open they see
     candidate and interview screens, with it closed they see the people
     already working for them. Rolling it into the form would mean every
     wording fix risked flipping their whole account. */
  if (action === 'open' || action === 'close') {
    if (pending) return NextResponse.json(
      { error: 'that person has no account yet — there is nothing to show them' }, { status: 400 });
    await setSearchOpen(client_key, action === 'open',
      reason === 'on_hold' ? 'on_hold' : 'withdrawn');
    return NextResponse.json({ ok: true });
  }

  const allowed = ['role_title', 'scope', 'hours', 'tools', 'target_at', 'stage'];
  const clean: Record<string, unknown> = {};
  allowed.forEach(k => { if (k in patch) clean[k] = patch[k]; });

  /* A bad write here used to surface as an unhandled 500 with no JSON body —
     which is what "an error code that it can't save" was: the toast had
     nothing to read, so it fell back to a generic failure. */
  try {
    await saveSearch(client_key, clean, !!pending);
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
