import { NextResponse } from 'next/server';
import { scoreInstrument, archetype, dispositionLine } from '@/lib/signature/score';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';

/* The only place a Signature is scored. Answers in, scores out. */
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { side, answers, pairs, timings, conditions } = await req.json();
  if (side !== 'client' && side !== 'talent')
    return NextResponse.json({ error: 'unknown instrument' }, { status: 400 });

  const clean = (timings ?? []).filter((t: number | null): t is number => t != null);
  /* Both instruments carry a forced-choice section now, not just talent's —
     this used to hardcode pairs to the talent side only, which meant an
     executive's forced-choice answers were collected on screen and then
     silently thrown away instead of scored. */
  const result = scoreInstrument(side, answers, pairs ?? null, clean);
  const type = archetype(result.scores, side);

  if (configured() && profile) {
    const sb = await supabaseServer();
    const { error: sigErr } = await sb.from('signatures').upsert({
      user_id: profile.id, side,
      scores: result.scores, facets: result.facets,
      validity: result.validity, confidence: result.confidence,
      conditions, archetype: type.id, taken_at: new Date().toISOString()
    }, { onConflict: 'user_id,side' });

    /* Twenty-two minutes of answers. Losing them in silence and telling the
       person it saved is the worst failure in the product. */
    if (sigErr) {
      console.error('[signature] could not save:', sigErr.message);
      return NextResponse.json({
        error: 'Your answers could not be saved. Nothing is lost — stay on this page and press Finish again.'
      }, { status: 500 });
    }

    await sb.from('signature_attempts')
      .update({ submitted: true }).eq('user_id', profile.id).eq('side', side);
  }

  return NextResponse.json({
    scores: result.scores, facets: result.facets,
    validity: result.validity, confidence: result.confidence,
    archetype: { id: type.id, n: type.n, r: type.r, tag: type.tag, d: type.d, seek: type.seek, friction: type.friction,
      strengths: type.strengths, growth: type.growth },
    disposition: dispositionLine(result.scores),
    saved: configured() && !!profile
  });
}
