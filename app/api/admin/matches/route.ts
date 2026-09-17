import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { setMatch, removeMatch, listMatches } from '@/lib/store';
import { personEmail } from '@/lib/work';
import { getBench } from '@/lib/data';
import { send, templates } from '@/lib/email';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}
export async function GET(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const clientId = new URL(req.url).searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'which executive?' }, { status: 400 });
  return NextResponse.json(await listMatches(clientId));
}

/* action: 'add' | 'remove' | 'release' | 'unrelease'
   ---------------------------------------------------
   'release' is the only action here that a client can perceive, so it is the
   only one that demands a deliberate confirmation. Without confirm:true the
   request is refused — a candidate cannot end up in front of an executive
   because something called this endpoint by accident. */
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const { clientId, talentId, action, overall, note, confirm } = await req.json();
  try {
    return await act(g.p!, { clientId, talentId, action, overall, note, confirm });
  } catch (e: any) {
    /* The database refuses some releases on purpose — an unverified
       candidate, a Watch not yet cleared — and says why. That reason used to
       die as a bare 500, so the console showed "That did not save" with no
       clue. Now the refusal is the message. */
    const why = String(e?.message ?? e);
    return NextResponse.json({ error: friendly(why) }, { status: 400 });
  }
}

function friendly(why: string) {
  if (/not verified/i.test(why))
    return 'This candidate is not verified yet — both documents must be verified on the Verification page before they can be sent to an executive.';
  if (/Taking The Watch/i.test(why)) return why;
  return why.replace(/^error:\s*/i, '');
}

async function act(me: { id: string }, { clientId, talentId, action, overall, note, confirm }: any) {
  /* Guard against the old hardcoded id ever reappearing: a release written to
     a client that does not exist is invisible until someone complains. */
  if (!clientId || !talentId || clientId === 'demo-client')
    return NextResponse.json({ error: 'that is not a real executive' }, { status: 400 });

  if (action === 'remove') await removeMatch(clientId, talentId);
  else if (action === 'add') await setMatch(clientId, talentId, { manual: true, released: false, overall: overall ?? null });
  else if (action === 'release') {
    if (confirm !== true)
      return NextResponse.json({
        error: 'A candidate is only sent to an executive from the approval panel.'
      }, { status: 400 });
    /* Taking The Watch is the capability gate: a talent who has claimed a
       discipline must have cleared it before they go in front of anyone.
       It used to be enforced by hiding them from the roster altogether, which
       read as a bug; now it is a refusal with the reason on screen. */
    const bench = await getBench();
    const who0 = bench.find(b => b.id === talentId);
    if (who0 && who0.has_disciplines && who0.watch_cleared === false)
      throw new Error('Taking The Watch has not cleared this candidate yet. Score their attempt on the Watch page first, or ask them to take it.');
    /* Editing the release note re-runs this same action — setMatch is an
       upsert, so "release" and "edit the note on an already-released
       candidate" look identical from here. Without this check, every note
       edit re-sent the "you have someone to see" email (admin-console
       audit, P1). Only a true first release (was not already released) mails. */
    const already = (await listMatches(clientId)).find(m => m.talent_id === talentId)?.released === true;
    await setMatch(clientId, talentId, {
      released: true,
      release_note: typeof note === 'string' && note.trim() ? note.trim() : null,
      released_by: me.id
    });
    /* The copy promises an email the moment there is someone to see. Until now
       nothing sent one, so an executive could have a candidate waiting and no
       reason to look. A failed send must not undo the approval. */
    if (!already) try {
      const to = await personEmail(clientId);
      const who = await personEmail(talentId);
      if (to?.email) {
        const tpl = templates.candidateReady({
          name: (to.name ?? '').trim().split(/\s+/)[0] || 'there',
          candidate: who?.name ?? 'your candidate'
        });
        await send(to.email, tpl);
      }
    } catch (e) { console.error('[matches] candidateReady send failed', clientId, talentId, e); }
  }
  else if (action === 'unrelease') await setMatch(clientId, talentId, { released: false });
  else return NextResponse.json({ error: 'unknown action' }, { status: 400 });

  return NextResponse.json({ ok: true });
}
