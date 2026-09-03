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
    if (side === 'client') return { scores: DEMO_EXEC.scores, facets: {}, conditions: DEMO_EXEC.cond,
      validity: { verdict:'Valid', im:30, attFails:0, inconsistency:14, extreme:36, straight:4, medSec:5.8, flags:[] },
      confidence: {}, archetype: null };
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
    if (side === 'client') return { scores: DEMO_EXEC.scores, facets: {}, conditions: DEMO_EXEC.cond,
      validity: { verdict:'Valid', im:30, attFails:0, inconsistency:14, extreme:36, straight:4, medSec:5.8, flags:[] },
      confidence: {}, archetype: null };
    const me = DEMO_BENCH.find(b => b.id === userId) ?? DEMO_BENCH[0];
    return { scores: me.scores, facets: me.facets, validity: me.validity,
             confidence: me.confidence, conditions: me.cond, archetype: null };
  }
  const sb = await supabaseServer();
  const { data } = await sb.from('signatures').select('*')
    .eq('user_id', userId).eq('side', side).maybeSingle();
  return (data as SignatureRow) ?? null;
}

/* What the executive actually sees: the people Relève has released to them,
   with the internal assessment machinery left behind. */
export type ShortlistEntry = {
  match_id: string; talent_id: string; overall: number;
  layer1: number | null; layer2: number | null; confidence: string | null;
  parts: any; conditions: any; client_state: string | null; released_at: string;
  name: string; role: string | null; loc: string | null; tz: string | null;
  yrs: number | null; eng: string | null; photo_url: string | null; bio: string | null;
  scores: Record<string, number>; archetype: string | null;
};

export async function myShortlist(clientId: string): Promise<ShortlistEntry[]> {
  if (!configured()) {
    return DEMO_BENCH.slice(0, 3).map((p, i) => ({
      match_id: 'demo' + i, talent_id: p.id, overall: 92 - i * 6,
      layer1: null, layer2: null, confidence: 'High', parts: null, conditions: null,
      client_state: null, released_at: new Date().toISOString(),
      name: p.name, role: p.role, loc: p.loc, tz: p.tz, yrs: p.yrs, eng: p.eng,
      photo_url: p.photo_url ?? null, bio: null, scores: p.scores, archetype: null
    })) as ShortlistEntry[];
  }
  const sb = await supabaseServer();
  const { data } = await sb.from('my_shortlist').select('*')
    .eq('client_id', clientId).order('overall', { ascending: false });
  return (data ?? []) as unknown as ShortlistEntry[];
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

export async function benchPercentile(trait: string, value: number) {
  const bench = await getBench();
  return percentile(value, bench.map(p => p.scores[trait]).filter(v => v != null));
}
export { archetype, dispositionLine, matchScore, conditionCheck };
export type { Person, Match };
