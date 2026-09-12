/* Reads that power the dashboards. Supabase when configured, demo bench otherwise. */
import { configured, supabaseServer, type Profile } from './supabase/server';
import { DEMO_BENCH, DEMO_EXEC, type Person } from './demo';
import { matchScore, conditionCheck, archetype, dispositionLine, percentile, type Match, type CondSet } from './signature/score';
import type { Scores, Validity, Conf } from './signature/model';

export type SignatureRow = {
  scores: Scores; facets: Record<string, number>;
  validity: Validity; confidence: Record<string, Conf>;
  conditions: CondSet | null; archetype: string | null;
};

export async function getMySignature(profile: Profile | null, side: 'client'|'talent'): Promise<SignatureRow | null> {
  if (!configured()) {
    if (side === 'client') return { scores: DEMO_EXEC.scores, facets: DEMO_EXEC.facets, conditions: DEMO_EXEC.cond,
      validity: { verdict:'Valid', im:30, attFails:0, inconsistency:14, extreme:36, straight:4, medSec:5.8, flags:[] },
      confidence: DEMO_EXEC.confidence, archetype: null };
    /* the signature of whoever is actually previewing, not a fixed row */
    const me = DEMO_BENCH.find(b => b.id === profile?.id) ?? DEMO_BENCH[0];
    return { scores: me.scores, facets: me.facets, validity: me.validity, confidence: me.confidence, conditions: me.cond, archetype: null };
  }
  if (!profile) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('signatures').select('*').eq('user_id', profile.id).eq('side', side).maybeSingle();
  return (data as SignatureRow) ?? null;
}

/* The bench, as the reader is allowed to see it. For the Relève team that is
   everyone; for a client it is only the people released to them, because
   talent_directory now runs under row level security rather than around it. */
export async function getBench(): Promise<Person[]> {
  if (!configured()) return DEMO_BENCH;
  const sb = await supabaseServer();
  const { data } = await sb.from('talent_directory').select('*');
  return (data ?? []) as unknown as Person[];
}

/* An executive's own Signature, read by the team so the console can rank the
   bench against the right person rather than against whoever is signed in. */
export async function signatureOf(userId: string, side: 'client' | 'talent'): Promise<SignatureRow | null> {
  if (!configured()) {
    if (side === 'client') return { scores: DEMO_EXEC.scores, facets: DEMO_EXEC.facets, conditions: DEMO_EXEC.cond,
      validity: { verdict:'Valid', im:30, attFails:0, inconsistency:14, extreme:36, straight:4, medSec:5.8, flags:[] },
      confidence: DEMO_EXEC.confidence, archetype: null };
    const me = DEMO_BENCH.find(b => b.id === userId) ?? DEMO_BENCH[0];
    return { scores: me.scores, facets: me.facets, validity: me.validity,
             confidence: me.confidence, conditions: me.cond, archetype: null };
  }
  const sb = await supabaseServer();
  const { data } = await sb.from('signatures').select('*')
    .eq('user_id', userId).eq('side', side).maybeSingle();
  return (data as SignatureRow) ?? null;
}



export type Ranked = { person: Person; match: Match; checks: ReturnType<typeof conditionCheck> };
export async function rankBench(exec: SignatureRow): Promise<Ranked[]> {
  const bench = await getBench();
  return bench
    .filter(p => p.stage !== 'Placed')
    .map(p => ({
      person: p,
      match: matchScore(exec.scores, p.scores, { validity: p.validity, confidence: p.confidence }),
      checks: conditionCheck(exec.conditions, p.cond)
    }))
    .sort((a, b) => b.match.overall - a.match.overall);
}

export { archetype, dispositionLine, matchScore, conditionCheck };
export type { Person, Match };
