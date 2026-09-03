import { NextResponse } from 'next/server';
import { scoreInstrument, archetype, dispositionLine } from '@/lib/signature/score';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';

/* The only place a Signature is scored. Answers in, scores out. */
export async function POST(req: Request) {
  const { side, answers, pairs, timings, conditions } = await req.json();
  if (side !== 'client' && side !== 'talent')
    return NextResponse.json({ error: 'unknown instrument' }, { status: 400 });

  const clean = (timings ?? []).filter((t: number | null): t is number => t != null);
  const result = scoreInstrument(side, answers, side === 'talent' ? pairs : null, clean);
  const type = archetype(result.scores, side);

  const profile = await currentProfile();
  if (configured() && profile) {
    const sb = await supabaseServer();
    await sb.from('signatures').upsert({
      user_id: profile.id, side,
      scores: result.scores, facets: result.facets,
      validity: result.validity, confidence: result.confidence,
      conditions, archetype: type.id, taken_at: new Date().toISOString()
    }, { onConflict: 'user_id,side' });
    await sb.from('signature_attempts')
      .update({ submitted: true }).eq('user_id', profile.id).eq('side', side);
  }

  return NextResponse.json({
    scores: result.scores, facets: result.facets,
    validity: result.validity, confidence: result.confidence,
    archetype: { id: type.id, n: type.n, r: type.r, tag: type.tag, d: type.d, seek: type.seek, friction: type.friction },
    disposition: dispositionLine(result.scores),
    saved: configured() && !!profile
  });
}
