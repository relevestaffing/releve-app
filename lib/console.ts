/* What the console needs to answer, in one place.

   The old Overview showed the shape of the bench on twelve axes. Interesting
   once; useless every morning. This gathers the things that decay if nobody
   looks at them, so the first screen is a list of what needs a person rather
   than a chart. */
import { configured, supabaseServer } from './supabase/server';

export type Attention = {
  key: string;
  level: 'high' | 'medium';
  /* Her real priority order, fixed. It used to sort by count, so eight routine
     vetting documents outranked one search about to breach the fourteen-day
     promise — the row whose own text says it loses a client quietly. Size of
     number is not urgency. */
  rank: number;
  count: number;
  what: string;          // what is wrong, in one line
  why: string;           // what happens if it is ignored
  href: string;
  cta: string;
};

export type Vitals = {
  clients: number; talent: number; verified: number; available: number;
  searchesOpen: number; candidatesOut: number; awaitingDecision: number;
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
    searchesOpen: 0, candidatesOut: 0, awaitingDecision: 0,
    placementsLive: 0, interviewsUpcoming: 0,
    runRateCents: 0, outstandingCents: 0, overdueCents: 0
  };
  if (!configured()) return { attention: [], vitals, placements: [] };

  const sb = await supabaseServer();
  const now = today();

  const [
    people, vetting, searches, matches, places, terms,
    invoices, checkins, pulses, timeOff, interviews, tasks, threads, decisions, offers,
    applications, allInv, payouts, payoutDetails, mailHealth
  ] = await Promise.all([
    sb.from('profiles').select('id, role, stage'),
    sb.from('vetting').select('talent_id, kind, state, expires_on'),
    sb.from('searches').select('id, client_id, stage, opened_at, first_candidate_on, guarantee_days, deposit_status, closed_at'),
    sb.from('matches').select('client_id, talent_id, released'),
    sb.from('placements').select('id, client_id, talent_id, started_on, ended_on, csm_id, reviewed_on, review_due_on, client:client_id(full_name, org_name), talent:talent_id(full_name)'),
    sb.from('placement_terms').select('placement_id, rate_month_cents'),
    sb.from('invoices').select('amount_cents, due_on, status'),
    sb.from('checkins').select('placement_id, week_ending, needs_attention'),
    sb.from('client_pulse').select('placement_id, month_of, needs_attention'),
    sb.from('time_off').select('id, state, starts_on'),
    sb.from('interviews').select('id, starts_at, status'),
    sb.from('tasks').select('placement_id, done, due_on'),
    /* Ordered newest-first, because the dedup below keeps only the first row
       it sees per thread and calls that the latest message — without an
       explicit order that "first seen" is just whatever order Postgres
       happens to hand rows back in, not actually the newest one. */
    sb.from('messages').select('id, subject_id, read_at, from_team').order('created_at', { ascending: false }),
    sb.from('talent_decisions').select('client_id, talent_id, state'),
    sb.from('offers').select('id, state, sent_on, placement_id'),
    sb.from('job_applications').select('id, state, created_at, call_state, call_at'),
    sb.from('invoices').select('id, kind, period_start, status, sent_at'),
    sb.from('talent_payments').select('id, state, period_start'),
    sb.from('talent_payout').select('talent_id, confirmed_at'),
    sb.from('email_health').select('failed_week, sent_week, last_success, last_failure').maybeSingle()
  ]);

  /* One row, or nothing at all if the table has not been created yet — the
     console must still render against a database that is one migration behind. */
  const mail = (mailHealth as any)?.data ?? null;

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
  /* Whether an executive has answered lives in talent_decisions, not in
     matches.client_state — that column was designed for it and nothing has
     ever written to it. Reading it would have counted every released
     candidate as unanswered forever. */
  const answered = new Set(
    ((decisions.data ?? []) as any[]).map(d => `${d.client_id}:${d.talent_id}`));

  const clientsWithRelease = new Set<string>();
  for (const m of (matches.data ?? []) as any[]) {
    if (m.released) {
      clientsWithRelease.add(m.client_id);
      if (!answered.has(`${m.client_id}:${m.talent_id}`)) vitals.awaitingDecision++;
    }
  }
  vitals.candidatesOut = clientsWithRelease.size;

  /* ---- money ---- */
  const rateBy = new Map<string, number | null>(
    ((terms.data ?? []) as any[]).map(t => [t.placement_id, t.rate_month_cents]));
  /* A draft has not been asked for, so it is not outstanding — the same rule
     moneySummary() applies on the Billing page. Counting drafts here meant
     the two screens showed different numbers under the same word. */
  for (const i of (invoices.data ?? []) as any[]) {
    if (i.status === 'sent' || i.status === 'failed') {
      vitals.outstandingCents += i.amount_cents;
      if (i.due_on && i.due_on < now) vitals.overdueCents += i.amount_cents;
    }
  }
  const suspendable = ((invoices.data ?? []) as any[]).filter(
    i => (i.status === 'sent' || i.status === 'failed') && i.due_on && daysBetween(i.due_on, now) >= 14).length;

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
  /* Waiting means: the newest message in a conversation came from them, so
     Relève owes a reply. This used to count every message with no read_at —
     but nothing in the app has ever written read_at, so the number only ever
     climbed and reading a message changed nothing. This matches what the
     Messages page itself shows. */
  const newest = new Map<string, boolean>();
  for (const m of ((threads.data ?? []) as any[])) {
    if (!newest.has(m.subject_id)) newest.set(m.subject_id, !m.from_team);
  }
  const unread = [...newest.values()].filter(Boolean).length;

  /* ---- what needs a person, worst first ---- */
  const attention: Attention[] = [];
  const add = (a: Attention) => { if (a.count > 0) attention.push(a); };

  /* Rank 0. Nothing else on this list matters if the platform cannot reach
     anybody — an unpaid invoice is a problem you can see, and an email that
     never arrived is one you cannot. This row is the whole reason email_log
     exists: the failure used to be invisible at every one of the twenty places
     that send mail. */
  const health = mail ?? null;
  const neverWorked = !health || health.last_success === null;
  const failedWeek = Number(health?.failed_week ?? 0);

  if (neverWorked) {
    attention.push({
      key: 'email_never', rank: 0, level: 'high', count: 1,
      what: 'email has never gone out successfully',
      why: 'Invitations, receipts and interview confirmations are all silently going nowhere. Nothing else on this list matters until this does.',
      href: '/console/team', cta: 'Test email now'
    });
  } else if (failedWeek > 0) {
    attention.push({
      key: 'email_failing', rank: 0, level: 'high', count: failedWeek,
      what: `emails bounced this week`,
      why: 'Each one is somebody who was told something and never heard it. The log names the message and the address.',
      href: '/console/team', cta: 'See what failed'
    });
  }

  add({ key: 'guarantee', rank: 1, level: 'high', count: guaranteeAtRisk.length,
    what: 'searches near the 14-day promise, nobody sent',
    why: 'This is the one that loses a client quietly, before they complain.',
    href: '/console/care', cta: 'See the searches' });

  add({ key: 'suspendable', rank: 2, level: 'high', count: suspendable,
    what: 'invoices unpaid 14+ days',
    why: 'Section 5 lets you suspend the placement. Decide before it drifts.',
    href: '/console/money', cta: 'Open the money' });

  /* Split, because these live on two different pages and the old single row
     sent her to Check-ins half the time when the flag was an executive's
     monthly pulse — which is only rendered on Care, and is the expensive kind. */
  add({ key: 'poor_pulse', rank: 3, level: 'high', count: flaggedPulse.size,
    what: 'executives with a flagged problem',
    why: 'An unhappy executive does not complain twice. They leave.',
    href: '/console/care', cta: 'Read what they said' });

  add({ key: 'poor_checkin', rank: 4, level: 'high', count: flaggedCheckin.size,
    what: 'check-ins that raised a flag',
    why: 'A flagged check-in does not fix itself, and they were brave to write it.',
    href: '/console/checkins', cta: 'Read what they said' });

  add({ key: 'vetting', rank: 5, level: 'high', count: new Set(vettingPending).size,
    what: 'documents waiting on verification',
    why: 'Nobody can be released to a client until their vetting is cleared.',
    href: '/console/vetting', cta: 'Verify them' });

  add({ key: 'offer_ready', rank: 4, level: 'high',
    count: ((offers.data ?? []) as any[]).filter(o => o.state === 'accepted' && !o.placement_id).length,
    what: 'offers accepted, not yet placed',
    why: 'The terms are agreed and nothing is running. One button turns each into a placement.',
    href: '/console/offers', cta: 'Place them' });

  add({ key: 'offer_open', rank: 6, level: 'medium',
    count: ((offers.data ?? []) as any[]).filter(o => ['sent','client_yes','talent_yes'].includes(o.state)).length,
    what: 'offers out and unanswered',
    why: 'An offer left hanging is how a candidate takes something else.',
    href: '/console/offers', cta: 'Chase it' });

  /* A search that is open with nobody in front of the executive is the work
     itself, and it showed nowhere until the 14-day promise was three days
     from lapsing. */
  const openWithNobody = ((searches.data ?? []) as any[]).filter(s =>
    s.stage !== 'Placed' && s.stage !== 'On hold' && !s.closed_at
    && s.client_id && !clientsWithRelease.has(s.client_id)).length;
  add({ key: 'nobody_released', rank: 6.8, level: 'medium', count: openWithNobody,
    what: 'open searches with nobody released yet',
    why: 'The 14-day promise is counting down from the day the search opened.',
    href: '/console/matching', cta: 'Rank and release' });

  add({ key: 'decision', rank: 7, level: 'medium', count: vitals.awaitingDecision,
    what: 'candidates out with no answer yet',
    why: 'A candidate left waiting is a search that has stalled.',
    href: '/console/matching', cta: 'Chase it' });

  /* Somebody wrote to you asking for work. Answering slowly is how a good
     applicant ends up somewhere else. */
  const apps = (applications.data ?? []) as any[];
  add({ key: 'applications', rank: 8, level: 'medium',
    count: apps.filter(a => a.state === 'new').length,
    what: 'applications not yet read',
    why: 'A good applicant who waits a week is applying somewhere else.',
    href: '/console/applications', cta: 'Read them' });

  /* A screening call whose time has come and gone with no outcome recorded is
     the quietest way for a promising person to be lost entirely. */
  add({ key: 'call_result', rank: 8.5, level: 'medium',
    count: apps.filter(a =>
      (a.call_state === 'invited' && (!a.call_at || Date.parse(a.call_at) <= Date.now()))
      || a.call_state === 'no_show').length,
    what: 'screening calls with no outcome recorded',
    why: 'Say whether it happened, while you still remember how it went.',
    href: '/console/applications', cta: 'Record them' });

  add({ key: 'call_decide', rank: 8.6, level: 'medium',
    count: apps.filter(a => a.call_state === 'held' && a.state !== 'invited' && a.state !== 'declined').length,
    what: "people you've spoken to, still waiting",
    why: 'They met you, they liked it, and now they are waiting. This is the worst place to leave someone.',
    href: '/console/applications', cta: 'Decide' });

  /* Revenue collection began when somebody remembered to press a button. */
  const monthStart = new Date();
  monthStart.setDate(1);
  const thisPeriod = monthStart.toISOString().slice(0, 10);
  const billedThisMonth = ((allInv.data ?? []) as any[])
    .some(i => i.kind === 'retainer' && i.period_start === thisPeriod);
  add({ key: 'run_month', rank: 2.5, level: 'high',
    count: billedThisMonth || placements.length === 0 ? 0 : 1,
    what: 'this month not billed yet',
    why: 'Nobody is invoiced until the run happens, and nothing else tells you it did not.',
    href: '/console/money', cta: 'Run the month' });

  const drafted = ((allInv.data ?? []) as any[]).filter(i => i.status === 'draft').length;
  add({ key: 'draft_invoices', rank: 6.5, level: 'medium', count: drafted,
    what: 'invoices drafted and never sent',
    why: 'A drafted invoice has not been asked for, so it will never be paid.',
    href: '/console/money', cta: 'Send them' });

  /* Money out. Owing somebody their wages is worse than being owed. */
  add({ key: 'pay_due', rank: 1.5, level: 'high',
    count: ((payouts.data ?? []) as any[]).filter(p => p.state === 'due').length,
    what: 'people waiting to be paid',
    why: 'This is somebody\'s rent. It outranks everything else on this list.',
    href: '/console/money', cta: 'Pay them' });

  /* Compared live placements against every payout row there was — including
     unplaced talent who had filled theirs in — so it read zero with placed
     people still missing, and high when the roster was diligent. */
  const payoutBy = new Set(((payoutDetails.data ?? []) as any[]).map(p => p.talent_id));
  const livePlacedTalent = new Set(((places.data ?? []) as any[])
    .filter(p => !p.ended_on).map(p => p.talent_id));
  add({ key: 'payout_missing', rank: 7.5, level: 'medium',
    count: [...livePlacedTalent].filter(t => !payoutBy.has(t)).length,
    what: 'placed people missing payment details',
    why: 'You cannot pay somebody whose bank details you do not have.',
    href: '/console/placements', cta: 'Chase them' });

  add({ key: 'timeoff', rank: 9, level: 'medium', count: timeOffWaiting,
    what: 'time-off requests waiting on you',
    why: 'Cover has to be arranged before the day, not on it.',
    href: '/console/care', cta: 'Decide' });

  add({ key: 'reviews', rank: 14, level: 'medium', count: reviewsDue,
    what: 'six-month reviews due',
    why: 'This is the only thing that teaches the matching engine anything.',
    href: '/console/care', cta: 'Record the outcomes' });

  add({ key: 'stale', rank: 12, level: 'medium', count: staleCheckin,
    what: 'placements quiet for over a week',
    why: 'Silence is not the same as fine. It is usually the opposite.',
    href: '/console/checkins', cta: 'See who is quiet' });

  add({ key: 'norate', rank: 11, level: 'medium', count: noRate,
    what: 'live placements with no rate set',
    why: 'They are skipped by the monthly run, so nothing is billed for them.',
    href: '/console/money', cta: 'Set the rates' });

  add({ key: 'deposit', rank: 10, level: 'medium', count: depositsDue,
    what: 'searches with an outstanding deposit',
    why: 'The deposit covers the sourcing you have already started.',
    href: '/console/money', cta: 'Chase the deposits' });

  add({ key: 'manager', rank: 13, level: 'medium', count: noManager,
    what: 'placements with no manager assigned',
    why: 'Nobody owns them, so nobody notices when they slip. Open the placement and set one on the pairing card.',
    href: '/console/placements', cta: 'Assign someone' });

  add({ key: 'unread', rank: 15, level: 'medium', count: unread,
    what: 'unread messages',
    why: 'Both sides were told they could reach you here.',
    href: '/console/messages', cta: 'Open the inbox' });

  attention.sort((a, b) => a.rank - b.rank);
  return { attention, vitals, placements };
}
