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

  /* Read the count once, agree the sentence to it — "1 search is" instead of
     "1 searches are". The number badge still carries the count on its own;
     this only keeps the sentence next to it grammatical. */
  const agree = (n: number, one: string, many: string) => n === 1 ? one : many;

  /* Rank 0. Nothing else on this list matters if the platform cannot reach
     anybody — an unpaid invoice is a problem you can see, and an email that
     never arrived is one you cannot. This row is the whole reason email_log
     exists: the failure used to be invisible at every one of the twenty places
     that send mail. */
  const health = mail ?? null;
  const neverWorked = !health || health.last_success === null;
  const failedWeek = Number(health?.failed_week ?? 0);

  /* Two rewrites live in every row below, not one. The first (12 September):
     what used to be a terse label with the reason hidden behind a tap on a
     question mark now reads as one sentence, visible without a click. The
     second (this pass): every sentence is now written toward the fix, not
     the threat — no "chase", no "lose a client", nothing framed as a loss
     already underway. Still true, still worth doing today; just said the
     way a business that expects to win talks to itself. */
  if (neverWorked) {
    attention.push({
      key: 'email_never', rank: 0, level: 'high', count: 1,
      what: 'email has never gone out successfully',
      why: 'fix this first — invitations, receipts and interview confirmations all depend on it, and everything else on this list follows from here',
      href: '/console/team', cta: 'Test email now'
    });
  } else if (failedWeek > 0) {
    attention.push({
      key: 'email_failing', rank: 0, level: 'high', count: failedWeek,
      what: `${agree(failedWeek, 'email', 'emails')} bounced this week`,
      why: 'each one is a message somebody is still waiting on — the log names who and what, so it is a quick fix',
      href: '/console/team', cta: 'See what failed'
    });
  }

  const guaranteeCount = guaranteeAtRisk.length;
  add({ key: 'guarantee', rank: 1, level: 'high', count: guaranteeCount,
    what: `${agree(guaranteeCount, 'search is', 'searches are')} close to the 14-day promise`,
    why: 'send a candidate now and keep the promise you made on day one',
    href: '/console/care', cta: 'See the searches' });

  add({ key: 'suspendable', rank: 2, level: 'high', count: suspendable,
    what: `${agree(suspendable, 'invoice has', 'invoices have')} gone unpaid two weeks or more`,
    why: 'Section 5 gives you the option to pause the placement — worth a quick look while it is fresh',
    href: '/console/money', cta: 'Open the money' });

  /* Split, because these live on two different pages and the old single row
     sent her to Check-ins half the time when the flag was an executive's
     monthly pulse — which is only rendered on Care, and is the expensive kind. */
  const poorPulseCount = flaggedPulse.size;
  add({ key: 'poor_pulse', rank: 3, level: 'high', count: poorPulseCount,
    what: `${agree(poorPulseCount, 'executive shared', 'executives shared')} feedback that needs a response`,
    why: 'a quick, caring reply here is what turns a bump into loyalty',
    href: '/console/care', cta: 'Read what they said' });

  const poorCheckinCount = flaggedCheckin.size;
  add({ key: 'poor_checkin', rank: 4, level: 'high', count: poorCheckinCount,
    what: `${agree(poorCheckinCount, 'check-in needs', 'check-ins need')} a closer look`,
    why: 'they took the time to speak up — following up shows it mattered',
    href: '/console/checkins', cta: 'Read what they said' });

  const vettingCount = new Set(vettingPending).size;
  add({ key: 'vetting', rank: 5, level: 'high', count: vettingCount,
    what: `${agree(vettingCount, 'person is', 'people are')} waiting on verification`,
    why: 'clearing this is what opens the door to their first placement',
    href: '/console/vetting', cta: 'Verify them' });

  const offerReadyCount = ((offers.data ?? []) as any[]).filter(o => o.state === 'accepted' && !o.placement_id).length;
  add({ key: 'offer_ready', rank: 4, level: 'high', count: offerReadyCount,
    what: `${agree(offerReadyCount, 'offer is', 'offers are')} accepted and ready to become a placement`,
    why: 'one click turns each into a placement',
    href: '/console/offers', cta: 'Place them' });

  const offerOpenCount = ((offers.data ?? []) as any[]).filter(o => ['sent','client_yes','talent_yes'].includes(o.state)).length;
  add({ key: 'offer_open', rank: 6, level: 'medium', count: offerOpenCount,
    what: `${agree(offerOpenCount, 'offer is', 'offers are')} still open for an answer`,
    why: 'a quick nudge now keeps the momentum on your side',
    href: '/console/offers', cta: 'Follow up' });

  /* A search that is open with nobody in front of the executive is the work
     itself, and it showed nowhere until the 14-day promise was three days
     from lapsing. */
  const openWithNobody = ((searches.data ?? []) as any[]).filter(s =>
    s.stage !== 'Placed' && s.stage !== 'On hold' && !s.closed_at
    && s.client_id && !clientsWithRelease.has(s.client_id)).length;
  add({ key: 'nobody_released', rank: 6.8, level: 'medium', count: openWithNobody,
    what: `${agree(openWithNobody, 'open search is', 'open searches are')} ready for a first candidate`,
    why: 'the 14-day window is open and waiting for your next move',
    href: '/console/matching', cta: 'Rank and release' });

  add({ key: 'decision', rank: 7, level: 'medium', count: vitals.awaitingDecision,
    what: `${agree(vitals.awaitingDecision, 'candidate is', 'candidates are')} out with no answer yet`,
    why: 'closing the loop here keeps the search moving toward a placement',
    href: '/console/matching', cta: 'Follow up' });

  /* Somebody wrote to you asking for work. Answering slowly is how a good
     applicant ends up somewhere else. */
  const apps = (applications.data ?? []) as any[];
  const newAppsCount = apps.filter(a => a.state === 'new').length;
  add({ key: 'applications', rank: 8, level: 'medium', count: newAppsCount,
    what: `${agree(newAppsCount, 'application is', 'applications are')} unread`,
    why: 'the sooner you read it, the sooner a great fit gets a call',
    href: '/console/applications', cta: 'Read them' });

  /* A screening call whose time has come and gone with no outcome recorded is
     the quietest way for a promising person to be lost entirely. */
  const callResultCount = apps.filter(a =>
    (a.call_state === 'invited' && (!a.call_at || Date.parse(a.call_at) <= Date.now()))
    || a.call_state === 'no_show').length;
  add({ key: 'call_result', rank: 8.5, level: 'medium', count: callResultCount,
    what: `${agree(callResultCount, 'screening call has', 'screening calls have')} no outcome recorded`,
    why: 'write it down while it is fresh, so the next step is easy',
    href: '/console/applications', cta: 'Record them' });

  const callDecideCount = apps.filter(a => a.call_state === 'held' && a.state !== 'invited' && a.state !== 'declined').length;
  add({ key: 'call_decide', rank: 8.6, level: 'medium', count: callDecideCount,
    what: `${agree(callDecideCount, 'person met you and is', 'people met you and are')} ready for your answer`,
    why: 'they liked what they saw — a decision now keeps that excitement alive',
    href: '/console/applications', cta: 'Decide' });

  /* Revenue collection began when somebody remembered to press a button. */
  const monthStart = new Date();
  monthStart.setDate(1);
  const thisPeriod = monthStart.toISOString().slice(0, 10);
  const billedThisMonth = ((allInv.data ?? []) as any[])
    .some(i => i.kind === 'retainer' && i.period_start === thisPeriod);
  add({ key: 'run_month', rank: 2.5, level: 'high',
    count: billedThisMonth || placements.length === 0 ? 0 : 1,
    what: 'this month is ready to be billed',
    why: 'running it now keeps revenue flowing on schedule',
    href: '/console/money', cta: 'Run the month' });

  const drafted = ((allInv.data ?? []) as any[]).filter(i => i.status === 'draft').length;
  add({ key: 'draft_invoices', rank: 6.5, level: 'medium', count: drafted,
    what: `${agree(drafted, 'invoice is', 'invoices are')} drafted and ready to send`,
    why: 'sending it is the only step between this work and getting paid for it',
    href: '/console/money', cta: 'Send them' });

  /* Money out. Owing somebody their wages is worse than being owed. */
  const payDueCount = ((payouts.data ?? []) as any[]).filter(p => p.state === 'due').length;
  add({ key: 'pay_due', rank: 1.5, level: 'high', count: payDueCount,
    what: `${agree(payDueCount, 'person is', 'people are')} ready to be paid`,
    why: 'this is somebody\'s rent — make it the first thing you clear today',
    href: '/console/money', cta: 'Pay them' });

  /* Compared live placements against every payout row there was — including
     unplaced talent who had filled theirs in — so it read zero with placed
     people still missing, and high when the roster was diligent. */
  const payoutBy = new Set(((payoutDetails.data ?? []) as any[]).map(p => p.talent_id));
  const livePlacedTalent = new Set(((places.data ?? []) as any[])
    .filter(p => !p.ended_on).map(p => p.talent_id));
  const payoutMissingCount = [...livePlacedTalent].filter(t => !payoutBy.has(t)).length;
  add({ key: 'payout_missing', rank: 7.5, level: 'medium', count: payoutMissingCount,
    what: `${agree(payoutMissingCount, 'placed person is', 'placed people are')} missing payment details`,
    why: 'getting their details on file is what lets you pay them without delay',
    href: '/console/placements', cta: 'Follow up' });

  add({ key: 'timeoff', rank: 9, level: 'medium', count: timeOffWaiting,
    what: `${agree(timeOffWaiting, 'time-off request is', 'time-off requests are')} waiting on you`,
    why: 'sorting cover now means a smooth day for everyone',
    href: '/console/care', cta: 'Decide' });

  add({ key: 'reviews', rank: 14, level: 'medium', count: reviewsDue,
    what: `${agree(reviewsDue, 'six-month review is', 'six-month reviews are')} due`,
    why: 'this is how every future match gets even better',
    href: '/console/care', cta: 'Record the outcomes' });

  add({ key: 'stale', rank: 12, level: 'medium', count: staleCheckin,
    what: `${agree(staleCheckin, 'placement has', 'placements have')} not checked in for over a week`,
    why: 'a quick check-in now keeps the relationship strong',
    href: '/console/checkins', cta: 'Check in' });

  add({ key: 'norate', rank: 11, level: 'medium', count: noRate,
    what: `${agree(noRate, 'live placement has', 'live placements have')} no rate set`,
    why: 'setting it now makes sure this placement gets billed on schedule',
    href: '/console/money', cta: 'Set the rates' });

  add({ key: 'deposit', rank: 10, level: 'medium', count: depositsDue,
    what: `${agree(depositsDue, 'search has', 'searches have')} an outstanding deposit`,
    why: 'the deposit covers sourcing that has already started',
    href: '/console/money', cta: 'Send a reminder' });

  add({ key: 'manager', rank: 13, level: 'medium', count: noManager,
    what: `${agree(noManager, 'placement has', 'placements have')} no manager assigned`,
    why: 'assigning one now means somebody is always looking out for this placement',
    href: '/console/placements', cta: 'Assign someone' });

  add({ key: 'unread', rank: 15, level: 'medium', count: unread,
    what: `${agree(unread, 'message is', 'messages are')} unread`,
    why: 'answering keeps the relationship personal',
    href: '/console/messages', cta: 'Open the inbox' });

  attention.sort((a, b) => a.rank - b.rank);
  return { attention, vitals, placements };
}
