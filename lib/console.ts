/* What the console needs to answer, in one place.

   The old Overview showed the shape of the bench on twelve axes. Interesting
   once; useless every morning. This gathers the things that decay if nobody
   looks at them, so the first screen is a list of what needs a person rather
   than a chart. */
import { configured, supabaseServer } from './supabase/server';

export type Attention = {
  key: string;
  level: 'high' | 'medium';
  count: number;
  what: string;          // what is wrong, in one line
  why: string;           // what happens if it is ignored
  href: string;
  cta: string;
};

export type Vitals = {
  clients: number; talent: number; verified: number; available: number;
  searchesOpen: number; shortlistsOut: number; awaitingDecision: number;
  placementsLive: number; interviewsUpcoming: number;
  runRateCents: number; outstandingCents: number; overdueCents: number;
};

export type LivePlacement = {
  id: string; client_name: string; org_name: string | null; talent_name: string;
  started_on: string; days: number;
  rate_month_cents: number | null;
  csm_id: string | null;
  lastCheckin: string | null; checkinFlagged: boolean;
  pulseFlagged: boolean; openTasks: number; overdueTasks: number;
  health: 'good' | 'watch' | 'poor';
};

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export async function consoleSnapshot(): Promise<{
  attention: Attention[]; vitals: Vitals; placements: LivePlacement[];
}> {
  const vitals: Vitals = {
    clients: 0, talent: 0, verified: 0, available: 0,
    searchesOpen: 0, shortlistsOut: 0, awaitingDecision: 0,
    placementsLive: 0, interviewsUpcoming: 0,
    runRateCents: 0, outstandingCents: 0, overdueCents: 0
  };
  if (!configured()) return { attention: [], vitals, placements: [] };

  const sb = await supabaseServer();
  const now = today();

  const [
    people, vetting, searches, matches, places, terms,
    invoices, checkins, pulses, timeOff, interviews, tasks, threads
  ] = await Promise.all([
    sb.from('profiles').select('id, role, stage'),
    sb.from('vetting').select('talent_id, kind, state, expires_on'),
    sb.from('searches').select('id, client_id, stage, opened_at, first_candidate_on, guarantee_days, deposit_status'),
    sb.from('matches').select('client_id, talent_id, released, client_state'),
    sb.from('placements').select('id, client_id, talent_id, started_on, ended_on, csm_id, reviewed_on, review_due_on, client:client_id(full_name, org_name), talent:talent_id(full_name)'),
    sb.from('placement_terms').select('placement_id, rate_month_cents'),
    sb.from('invoices').select('amount_cents, due_on, status'),
    sb.from('checkins').select('placement_id, week_ending, needs_attention'),
    sb.from('client_pulse').select('placement_id, month_of, needs_attention'),
    sb.from('time_off').select('id, state, starts_on'),
    sb.from('interviews').select('id, starts_at, status'),
    sb.from('tasks').select('placement_id, done, due_on'),
    sb.from('messages').select('id, read_at, from_team')
  ]);

  /* ---- people ---- */
  for (const p of (people.data ?? []) as any[]) {
    if (p.role === 'client') vitals.clients++;
    if (p.role === 'talent') {
      vitals.talent++;
      if (p.stage !== 'Placed') vitals.available++;
    }
  }

  /* ---- who is fully verified: identity plus a signed agreement ---- */
  const verifiedKinds = new Map<string, Set<string>>();
  const vettingPending: string[] = [];
  for (const v of (vetting.data ?? []) as any[]) {
    if (v.state === 'verified' && (!v.expires_on || v.expires_on >= now)) {
      if (!verifiedKinds.has(v.talent_id)) verifiedKinds.set(v.talent_id, new Set());
      verifiedKinds.get(v.talent_id)!.add(String(v.kind));
    }
    if (v.state === 'submitted') vettingPending.push(v.talent_id);
  }
  for (const k of verifiedKinds.values())
    if (k.has('identity') && k.has('agreement')) vitals.verified++;

  /* ---- searches and the 14-day promise ---- */
  const guaranteeAtRisk: string[] = [];
  for (const s of (searches.data ?? []) as any[]) {
    if (s.stage !== 'Placed' && s.stage !== 'On hold') {
      vitals.searchesOpen++;
      const open = daysBetween(s.opened_at, now);
      if (!s.first_candidate_on && open >= (s.guarantee_days ?? 14) - 3)
        guaranteeAtRisk.push(s.id);
    }
  }
  const depositsDue = (searches.data ?? [])
    .filter((s: any) => s.deposit_status === 'due' && s.stage !== 'On hold').length;

  /* ---- shortlists ---- */
  const clientsWithRelease = new Set<string>();
  for (const m of (matches.data ?? []) as any[]) {
    if (m.released) {
      clientsWithRelease.add(m.client_id);
      if (!m.client_state) vitals.awaitingDecision++;
    }
  }
  vitals.shortlistsOut = clientsWithRelease.size;

  /* ---- money ---- */
  const rateBy = new Map<string, number | null>(
    ((terms.data ?? []) as any[]).map(t => [t.placement_id, t.rate_month_cents]));
  for (const i of (invoices.data ?? []) as any[]) {
    if (i.status === 'draft' || i.status === 'sent') {
      vitals.outstandingCents += i.amount_cents;
      if (i.due_on && i.due_on < now) vitals.overdueCents += i.amount_cents;
    }
  }
  const suspendable = ((invoices.data ?? []) as any[]).filter(
    i => (i.status === 'draft' || i.status === 'sent') && i.due_on && daysBetween(i.due_on, now) >= 14).length;

  /* ---- placements, and how each one is actually doing ---- */
  const lastCheckinBy = new Map<string, string>();
  const flaggedCheckin = new Set<string>();
  for (const c of (checkins.data ?? []) as any[]) {
    const prev = lastCheckinBy.get(c.placement_id);
    if (!prev || c.week_ending > prev) lastCheckinBy.set(c.placement_id, c.week_ending);
    if (c.needs_attention) flaggedCheckin.add(c.placement_id);
  }
  const flaggedPulse = new Set<string>(
    ((pulses.data ?? []) as any[]).filter(p => p.needs_attention).map(p => p.placement_id));

  const openTasksBy = new Map<string, number>();
  const overdueTasksBy = new Map<string, number>();
  for (const t of (tasks.data ?? []) as any[]) {
    if (t.done) continue;
    openTasksBy.set(t.placement_id, (openTasksBy.get(t.placement_id) ?? 0) + 1);
    if (t.due_on && t.due_on < now)
      overdueTasksBy.set(t.placement_id, (overdueTasksBy.get(t.placement_id) ?? 0) + 1);
  }

  const placements: LivePlacement[] = [];
  let noRate = 0, noManager = 0, reviewsDue = 0, staleCheckin = 0;

  for (const p of (places.data ?? []) as any[]) {
    if (p.ended_on) {
      if (!p.reviewed_on && p.review_due_on && p.review_due_on <= now) reviewsDue++;
      continue;
    }
    vitals.placementsLive++;
    const rate = rateBy.get(p.id) ?? null;
    if (rate == null) noRate++; else vitals.runRateCents += rate;
    if (!p.csm_id) noManager++;
    if (!p.reviewed_on && p.review_due_on && p.review_due_on <= now) reviewsDue++;

    const last = lastCheckinBy.get(p.id) ?? null;
    const stale = !last || daysBetween(last, now) > 10;
    if (stale && daysBetween(p.started_on, now) > 10) staleCheckin++;

    const flagged = flaggedCheckin.has(p.id) || flaggedPulse.has(p.id);
    const overdue = overdueTasksBy.get(p.id) ?? 0;

    placements.push({
      id: p.id,
      client_name: p.client?.full_name ?? 'Client',
      org_name: p.client?.org_name ?? null,
      talent_name: p.talent?.full_name ?? 'Talent',
      started_on: p.started_on,
      days: daysBetween(p.started_on, now),
      rate_month_cents: rate,
      csm_id: p.csm_id,
      lastCheckin: last,
      checkinFlagged: flaggedCheckin.has(p.id),
      pulseFlagged: flaggedPulse.has(p.id),
      openTasks: openTasksBy.get(p.id) ?? 0,
      overdueTasks: overdue,
      health: flagged || overdue > 2 ? 'poor' : (stale || overdue > 0) ? 'watch' : 'good'
    });
  }
  placements.sort((a, b) =>
    ({ poor: 0, watch: 1, good: 2 })[a.health] - ({ poor: 0, watch: 1, good: 2 })[b.health]);

  /* ---- the rest ---- */
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString();
  vitals.interviewsUpcoming = ((interviews.data ?? []) as any[]).filter(
    i => i.starts_at > new Date().toISOString() && i.starts_at < soon
      && i.status !== 'Cancelled' && i.status !== 'Declined').length;

  const timeOffWaiting = ((timeOff.data ?? []) as any[]).filter(t => t.state === 'requested').length;
  /* Unread means: sent TO Relève and not yet opened. A message the team sent
     that the other side has not read is their business, not hers. */
  const unread = ((threads.data ?? []) as any[]).filter(m => !m.read_at && !m.from_team).length;

  /* ---- what needs a person, worst first ---- */
  const attention: Attention[] = [];
  const add = (a: Attention) => { if (a.count > 0) attention.push(a); };

  add({ key: 'guarantee', level: 'high', count: guaranteeAtRisk.length,
    what: 'searches near the 14-day promise with nobody put forward',
    why: 'This is the one that loses a client quietly, before they complain.',
    href: '/console/care', cta: 'See the searches' });

  add({ key: 'suspendable', level: 'high', count: suspendable,
    what: 'invoices unpaid for more than fourteen days',
    why: 'Section 5 lets you suspend the placement. Decide before it drifts.',
    href: '/console/money', cta: 'Open the money' });

  add({ key: 'poor', level: 'high', count: placements.filter(p => p.health === 'poor').length,
    what: 'placements where somebody has flagged a problem',
    why: 'A flagged check-in or an unhappy executive does not fix itself.',
    href: '/console/checkins', cta: 'Read what they said' });

  add({ key: 'vetting', level: 'high', count: new Set(vettingPending).size,
    what: 'documents waiting on you to verify',
    why: 'Nobody can be released to a client until their vetting is cleared.',
    href: '/console/vetting', cta: 'Verify them' });

  add({ key: 'decision', level: 'medium', count: vitals.awaitingDecision,
    what: 'candidates sent to executives with no answer yet',
    why: 'A shortlist that sits is a search that has stalled.',
    href: '/console/matching', cta: 'Chase it' });

  add({ key: 'timeoff', level: 'medium', count: timeOffWaiting,
    what: 'time-off requests waiting on you',
    why: 'Cover has to be arranged before the day, not on it.',
    href: '/console/care', cta: 'Decide' });

  add({ key: 'reviews', level: 'medium', count: reviewsDue,
    what: 'six-month reviews due',
    why: 'This is the only thing that teaches the matching engine anything.',
    href: '/console/care', cta: 'Record the outcomes' });

  add({ key: 'stale', level: 'medium', count: staleCheckin,
    what: 'placements with no check-in in over a week',
    why: 'Silence is not the same as fine. It is usually the opposite.',
    href: '/console/checkins', cta: 'See who is quiet' });

  add({ key: 'norate', level: 'medium', count: noRate,
    what: 'live placements with no rate set',
    why: 'They are skipped by the monthly run, so nothing is billed for them.',
    href: '/console/money', cta: 'Set the rates' });

  add({ key: 'deposit', level: 'medium', count: depositsDue,
    what: 'searches with the deposit still outstanding',
    why: 'The deposit covers the sourcing you have already started.',
    href: '/console/money', cta: 'Chase the deposits' });

  add({ key: 'manager', level: 'medium', count: noManager,
    what: 'placements with no Client Success Manager assigned',
    why: 'Nobody owns them, so nobody notices when they slip. Open the placement and set one on the pairing card.',
    href: '/console/placements', cta: 'Assign someone' });

  add({ key: 'unread', level: 'medium', count: unread,
    what: 'unread messages',
    why: 'Both sides were told they could reach you here.',
    href: '/console/messages', cta: 'Open the inbox' });

  attention.sort((a, b) => (a.level === b.level ? b.count - a.count : a.level === 'high' ? -1 : 1));
  return { attention, vitals, placements };
}
