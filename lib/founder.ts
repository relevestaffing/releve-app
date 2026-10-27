/* The founder's two oversight reads: where the business is heading, and who
   on the team is carrying what. Both are read-only aggregations over tables
   the console already keeps; nothing here writes or decides. Owner-gated at
   the call site (the Overview band and the Team page), not here. */
import { configured, supabaseServer } from '@/lib/supabase/server';
import { todayInPacific } from '@/lib/money-public';
import type { TeamRole } from '@/lib/care-public';

/* ---------- where the business is heading ---------- */

export type Trend = {
  /* the last six months of monthly run rate, oldest first, for a sparkline */
  runRate: { month: string; cents: number }[];
  runRateNowCents: number;
  /* change in run rate against three months ago, as a signed fraction
     (0.12 = up 12 per cent); null when there is no base to compare to */
  runRateDelta: number | null;
  placementsLive: number;
  placedThisMonth: number;
  endedThisMonth: number;
  /* seats held against seats lost over the window, as a percentage */
  retentionPct: number | null;
  atRisk: number;
};

/* A compact trajectory for the owner. Takes the pieces the console already
   computes (12 months of MRR, this-quarter retention) so the band on the
   Overview costs one extra query, not a second reporting pass. */
export async function businessTrend(mrrByMonth: { month: string; cents: number }[],
                                    retentionPct: number | null,
                                    atRisk: number): Promise<Trend> {
  const empty: Trend = {
    runRate: [], runRateNowCents: 0, runRateDelta: null,
    placementsLive: 0, placedThisMonth: 0, endedThisMonth: 0,
    retentionPct, atRisk
  };
  /* Preview mode has no money or placements, so the band would open on a
     wall of zeros. Show a believable business instead, the way the rest of
     the demo does, so the owner can see what this looks like full. */
  if (!configured()) {
    const series = [27000_00, 31500_00, 31500_00, 36000_00, 40500_00, 45000_00]
      .map((cents, i) => ({ month: mrrByMonth[i]?.month ?? `m${i}`, cents }));
    return {
      runRate: series, runRateNowCents: 45000_00, runRateDelta: 0.25,
      placementsLive: 10, placedThisMonth: 2, endedThisMonth: 1,
      retentionPct: 92, atRisk
    };
  }

  const six = mrrByMonth.slice(-6).map(m => ({ month: m.month, cents: m.cents }));
  const now = mrrByMonth.length ? mrrByMonth[mrrByMonth.length - 1].cents : 0;
  const base = mrrByMonth.length >= 4 ? mrrByMonth[mrrByMonth.length - 4].cents : 0;
  const delta = base > 0 ? (now - base) / base : null;
  const sb = await supabaseServer();
  const monthStart = todayInPacific().slice(0, 8) + '01';
  const { data: places } = await sb.from('placements')
    .select('started_on, ended_on');
  let live = 0, placed = 0, ended = 0;
  for (const p of (places ?? []) as any[]) {
    if (!p.ended_on) live++;
    if (p.started_on && p.started_on >= monthStart) placed++;
    if (p.ended_on && p.ended_on >= monthStart) ended++;
  }
  return {
    runRate: six, runRateNowCents: now, runRateDelta: delta,
    placementsLive: live, placedThisMonth: placed, endedThisMonth: ended,
    retentionPct, atRisk
  };
}

/* ---------- who is carrying what ---------- */

export type MemberLoad = {
  user_id: string;
  name: string;
  email: string;
  team_role: TeamRole;
  executives: number;     // live placements they look after as Client Success
  talent: number;         // live placements they look after as Talent Success
  openRequests: number;   // requests from their executives still open
  reviewsOverdue: number; // their placements past a review with none filed
  flaggedReports: number; // an end of week report on their book that raised a hand
  lastActedAt: string | null;
};

/* One row per person with console access, with their book beside their name.
   Owner-gated at the call site. Everything is scoped to live placements, so a
   manager who has handed a placement on is not still charged with it. */
export async function teamLoad(): Promise<MemberLoad[]> {
  if (!configured()) return [
    { user_id: 'demo-admin', name: 'Rae Lindqvist', email: 'hello@relevestaffing.com',
      team_role: 'owner', executives: 0, talent: 0, openRequests: 0, reviewsOverdue: 0,
      flaggedReports: 0, lastActedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() },
    { user_id: 'demo-csm', name: 'Marguerite Vance', email: 'marguerite@relevestaffing.com',
      team_role: 'client_success', executives: 6, talent: 0, openRequests: 2, reviewsOverdue: 1,
      flaggedReports: 0, lastActedAt: new Date(Date.now() - 20 * 3_600_000).toISOString() },
    { user_id: 'demo-tsm', name: 'Theo Okafor', email: 'theo@relevestaffing.com',
      team_role: 'talent_success', executives: 0, talent: 8, openRequests: 0, reviewsOverdue: 0,
      flaggedReports: 1, lastActedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }
  ];
  const sb = await supabaseServer();
  const now = todayInPacific();

  const [{ data: admins }, { data: roles }, { data: places }, { data: reqs },
         { data: checks }, { data: audit }] = await Promise.all([
    sb.from('profiles').select('id, full_name, email').eq('role', 'admin'),
    sb.from('team_roles').select('user_id, team_role'),
    sb.from('placements')
      .select('id, client_id, talent_id, csm_id, tsm_id, ended_on, reviewed_on, review_due_on'),
    sb.from('client_requests').select('placement_id, state').in('state', ['open', 'in_hand']),
    sb.from('checkins').select('placement_id, needs_attention').eq('needs_attention', true),
    sb.from('audit_log').select('actor_email, at').order('at', { ascending: false }).limit(400)
  ]);

  const roleOf = new Map(((roles ?? []) as any[]).map(r => [r.user_id, r.team_role as TeamRole]));

  /* Executives and talent are counted end to end, by who owns the account on
     the person (profiles.csm_id / profiles.tsm_id), not only by live
     placements. Someone looking after an executive who is still waiting on
     their first match is carrying that account. Those columns are new
     (part50), so read them on their own: a missing column yields 0, not a
     failed page. Open requests, overdue reviews and flagged reports stay
     scoped to live placements below. */
  const ownedCsm = new Map<string, number>();
  const ownedTsm = new Map<string, number>();
  try {
    const { data: owned, error } = await sb.from('profiles').select('id, role, csm_id, tsm_id');
    if (!error) for (const p of (owned ?? []) as any[]) {
      if (p.role === 'client' && p.csm_id) ownedCsm.set(p.csm_id, (ownedCsm.get(p.csm_id) ?? 0) + 1);
      if (p.role === 'talent' && p.tsm_id) ownedTsm.set(p.tsm_id, (ownedTsm.get(p.tsm_id) ?? 0) + 1);
    }
  } catch { /* the owner columns are not there yet */ }

  /* last action per person, from the most recent audit rows */
  const lastActed = new Map<string, string>();
  for (const a of (audit ?? []) as any[]) {
    const e = (a.actor_email ?? '').toLowerCase();
    if (e && !lastActed.has(e)) lastActed.set(e, a.at);
  }

  const live = ((places ?? []) as any[]).filter(p => !p.ended_on);
  const openReqByPlacement = new Set<string>();
  const reqCountByPlacement = new Map<string, number>();
  for (const r of (reqs ?? []) as any[]) {
    openReqByPlacement.add(r.placement_id);
    reqCountByPlacement.set(r.placement_id, (reqCountByPlacement.get(r.placement_id) ?? 0) + 1);
  }
  const flaggedByPlacement = new Map<string, number>();
  for (const c of (checks ?? []) as any[])
    flaggedByPlacement.set(c.placement_id, (flaggedByPlacement.get(c.placement_id) ?? 0) + 1);

  return ((admins ?? []) as any[]).map(m => {
    const asCsm = live.filter(p => p.csm_id === m.id);
    const asTsm = live.filter(p => p.tsm_id === m.id);
    const mine = [...new Set([...asCsm, ...asTsm])];
    let openRequests = 0, reviewsOverdue = 0, flaggedReports = 0;
    for (const p of asCsm) openRequests += reqCountByPlacement.get(p.id) ?? 0;
    for (const p of mine) {
      if (!p.reviewed_on && p.review_due_on && p.review_due_on <= now) reviewsOverdue++;
      flaggedReports += flaggedByPlacement.get(p.id) ?? 0;
    }
    return {
      user_id: m.id as string,
      name: (m.full_name as string) ?? (m.email as string),
      email: m.email as string,
      team_role: roleOf.get(m.id) ?? 'owner',
      executives: ownedCsm.get(m.id) ?? 0,
      talent: ownedTsm.get(m.id) ?? 0,
      openRequests, reviewsOverdue, flaggedReports,
      lastActedAt: lastActed.get((m.email ?? '').toLowerCase()) ?? null
    } as MemberLoad;
  }).sort((a, b) =>
    (b.openRequests + b.reviewsOverdue + b.flaggedReports) -
    (a.openRequests + a.reviewsOverdue + a.flaggedReports));
}
