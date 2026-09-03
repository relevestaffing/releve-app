import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { setMatch, removeMatch, listMatches } from '@/lib/store';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (configured() && p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}
export async function GET(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const clientId = new URL(req.url).searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'which executive?' }, { status: 400 });
  return NextResponse.json(await listMatches(clientId));
}
/* action: 'add' | 'remove' | 'release' | 'unrelease' */
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const { clientId, talentId, action, overall } = await req.json();
  /* Guard against the old hardcoded id ever reappearing: a release written to
     a client that does not exist is invisible until someone complains. */
  if (!clientId || !talentId || clientId === 'demo-client')
    return NextResponse.json({ error: 'that is not a real executive' }, { status: 400 });
  if (action === 'remove') await removeMatch(clientId, talentId);
  else if (action === 'add') await setMatch(clientId, talentId, { manual: true, released: false, overall: overall ?? null });
  else if (action === 'release') await setMatch(clientId, talentId, { released: true });
  else if (action === 'unrelease') await setMatch(clientId, talentId, { released: false });
  return NextResponse.json({ ok: true });
}
