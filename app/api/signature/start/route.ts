import { NextResponse } from 'next/server';
import { INSTRUMENT, sections, SCALE, AXIS, FACET } from '@/lib/signature/model';
import { currentProfile } from '@/lib/supabase/server';
import { loadAttempt } from '@/lib/attempts';

/* Sends the browser the statements only — never which axis they load onto. */
export async function POST(req: Request) {
  /* The instrument is the product's own IP: signed-in accounts only. */
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { side, fresh } = await req.json();
  if (side !== 'client' && side !== 'talent')
    return NextResponse.json({ error: 'unknown instrument' }, { status: 400 });

  const inst = INSTRUMENT[side as 'client' | 'talent'];
  const screens = inst.items.map((it, i) => ({
    i, kind: 'likert' as const,
    /* Only the instructed-response items are signposted. Labelling the
       impression-management and duplicate items told an observant candidate
       exactly which statements to answer modestly — which is the behaviour
       those items exist to catch. */
    tag: it.kind === 'validity'
       ? (it.vkind === 'att' ? 'Instruction' : 'Disposition')
       : it.kind === 'facet' ? FACET[it.key].name
       : AXIS[it.key].name,
    text: it.text
  }));
  const pairs = inst.pairs.map((p, n) => ({ i: inst.items.length + n, kind: 'pair' as const, a: p.a.s, b: p.b.s }));

  /* A retake starts clean. Loading the old attempt on a retake dropped the
     person straight onto the final screen with every previous answer intact
     — an Invalid Signature resubmitted the identical answers and failed the
     same way, with no way out. */
  const saved = fresh ? null : await loadAttempt(side, me.id);

  return NextResponse.json({
    total: inst.total, itemCount: inst.items.length,
    screens, pairs, scale: SCALE, sections: sections(side),
    saved: saved
      ? { answers: saved.answers, pairs: saved.pairs, conditions: saved.conditions ?? {} }
      : null
  });
}
