/* The working layer — tasks, weekly check-ins, and messages to Relève.
   Everything here reads through the signed-in person's own session, so row
   level security decides what comes back. Nothing is filtered in JavaScript
   that the database is not already enforcing. */
import { configured, supabaseServer } from './supabase/server';
import type { Checkin, Decision, DecisionState, InterviewFeedback, Message, Origin, Placement, Priority, Task, Vetting } from './work-public';

export * from './work-public';

/* ---------- placements ---------- */

export async function listPlacementsFor(userId: string): Promise<Placement[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb
    .from('placements')
    .select('id, client_id, talent_id, started_on, ended_on, client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .or(`client_id.eq.${userId},talent_id.eq.${userId}`)
    .is('ended_on', null)
    .order('started_on', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, client_id: r.client_id, talent_id: r.talent_id, started_on: r.started_on,
    client_name: r.client?.full_name ?? 'Executive',
    talent_name: r.talent?.full_name ?? 'Talent',
    org_name: r.client?.org_name ?? null
  }));
}

export async function allPlacements(): Promise<Placement[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb
    .from('placements')
    .select('id, client_id, talent_id, started_on, ended_on, client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .is('ended_on', null)
    .order('started_on', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, client_id: r.client_id, talent_id: r.talent_id, started_on: r.started_on,
    client_name: r.client?.full_name ?? 'Executive',
    talent_name: r.talent?.full_name ?? 'Talent',
    org_name: r.client?.org_name ?? null
  }));
}

/* ---------- tasks ---------- */

export async function listTasks(placementId: string): Promise<Task[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('tasks').select('*')
    .eq('placement_id', placementId)
    .order('done', { ascending: true })
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as Task[];
}

export async function createTask(row: {
  placement_id: string; title: string; detail?: string | null;
  priority?: Priority; due_on?: string | null; origin?: Origin;
  origin_note?: string | null; created_by: string;
}) {
  const sb = await supabaseServer();
  const { data, error } = await sb.from('tasks').insert({
    placement_id: row.placement_id,
    title: row.title,
    detail: row.detail || null,
    priority: row.priority ?? 'normal',
    due_on: row.due_on || null,
    origin: row.origin ?? 'self',
    origin_note: row.origin_note || null,
    created_by: row.created_by
  }).select().single();
  if (error) throw new Error(error.message);
  return data as Task;
}

export async function updateTask(id: string, patch: Partial<Task>, byUser: string) {
  const sb = await supabaseServer();
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  (['title', 'detail', 'priority', 'due_on', 'origin', 'origin_note'] as const)
    .forEach(k => { if (k in patch) body[k] = (patch as any)[k]; });
  if ('done' in patch) {
    body.done = patch.done;
    body.done_at = patch.done ? new Date().toISOString() : null;
    body.done_by = patch.done ? byUser : null;
  }
  const { data, error } = await sb.from('tasks').update(body).eq('id', id)
    .select('id, placement_id, title, done, done_by, created_by').maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as { id: string; placement_id: string; title: string; done: boolean; done_by: string | null; created_by: string } | null;
}

export async function deleteTask(id: string) {
  const sb = await supabaseServer();
  /* Row level security ("delete own tasks") silently matches zero rows for a
     task that is not the caller's own or not in a placement they are on — a
     delete against a row RLS refuses raises no error, it just deletes
     nothing, and the route above would otherwise report { ok: true } for a
     task that is still sitting there. Asking for the row back is what turns
     that into a real error instead of a false success. */
  const { data, error } = await sb.from('tasks').delete().eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That task could not be deleted — it may not be yours to remove.');
}

/* ---------- check-ins ---------- */

export async function listCheckins(filter?: { talentId?: string; limit?: number }): Promise<Checkin[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  let q = sb.from('checkins').select('*').order('week_ending', { ascending: false });
  if (filter?.talentId) q = q.eq('talent_id', filter.talentId);
  const { data } = await q.limit(filter?.limit ?? 60);
  return (data ?? []) as Checkin[];
}

export async function saveCheckin(row: {
  placement_id: string; talent_id: string; week_ending: string;
  shipped?: string | null; blocked?: string | null; rapport?: number | null;
  workload?: string | null; note?: string | null;
}) {
  const sb = await supabaseServer();
  const { error } = await sb.from('checkins').upsert({
    placement_id: row.placement_id,
    talent_id: row.talent_id,
    week_ending: row.week_ending,
    shipped: row.shipped || null,
    blocked: row.blocked || null,
    rapport: row.rapport ?? null,
    workload: row.workload || null,
    note: row.note || null,
    submitted_at: new Date().toISOString()
  }, { onConflict: 'placement_id,week_ending' });
  if (error) throw new Error(error.message);
}

/* ---------- messages ---------- */

export async function listMessages(subjectId: string): Promise<Message[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('messages').select('*')
    .eq('subject_id', subjectId).order('created_at', { ascending: true });
  return (data ?? []) as Message[];
}

/* The direct line for one placement — a client and the talent they're
   paired with, talking to each other rather than to Relève. Same table,
   same row shape, just keyed by placement_id instead of subject_id; row
   level security (in_placement()) is what actually keeps this to the two
   people on that placement, plus the team. */
export async function listPlacementMessages(placementId: string): Promise<Message[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('messages').select('*')
    .eq('placement_id', placementId).order('created_at', { ascending: true });
  return (data ?? []) as Message[];
}

export async function sendMessage(row: {
  subject_id?: string; placement_id?: string; sender_id: string; body: string; from_team: boolean;
}) {
  const sb = await supabaseServer();
  const { error } = await sb.from('messages').insert(row);
  if (error) throw new Error(error.message);
}

/* Every thread with its latest line — the Relève inbox. Unread threads lead,
   newest first within that group, the way a phone's own messages app sorts
   them — so the moment there is something to answer, it is the first thing
   seen rather than wherever it happened to fall in time.

   Aggregated in the database by message_threads() (schema PART 23) rather
   than by pulling recent rows into JavaScript and grouping them here: a flat
   "most recent 400 messages" query is capped across every conversation
   combined, not per thread, so once there is enough real volume a thread
   that has gone quiet — its last message older than the 400th most recent
   message system-wide — silently drops off the inbox entirely, unread and
   all. The RPC has one row per thread no matter how many messages it holds,
   so nothing goes missing. */
export async function listThreads() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data: rows } = await sb.rpc('message_threads');
  if (!rows?.length) return [];

  const ids = (rows as any[]).map(r => r.subject_id);
  const { data: profiles } = await sb.from('profiles')
    .select('id, full_name, email, role, org_name').in('id', ids);
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  const threads = (rows as any[]).map(r => {
    const p = byId.get(r.subject_id);
    return {
      subject_id: r.subject_id,
      name: p?.full_name ?? p?.email ?? 'Someone',
      role: p?.role ?? 'talent',
      org_name: p?.org_name ?? null,
      last: r.last, last_at: r.last_at,
      waiting: r.waiting,             // their last word — Relève owes a reply
      /* read_at is only ever set by markThreadRead(), below, the instant the
         console actually opens a thread — so a count of what is still null
         is a true "Relève has not looked at this yet" tally, not a guess. */
      unread: r.unread ?? 0
    };
  });
  threads.sort((a, b) =>
    (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) ||
    +new Date(b.last_at) - +new Date(a.last_at));
  return threads;
}

/* Opening a thread is what reading it means — called the moment the console
   asks for one person's messages, so the unread count above reflects what
   Relève has actually looked at rather than needing its own "mark as read"
   button nobody would remember to press. */
export async function markThreadRead(subjectId: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  await sb.from('messages').update({ read_at: new Date().toISOString() })
    .eq('subject_id', subjectId).eq('from_team', false).is('read_at', null);
}

/* ---------- placements: making and ending them ---------- */

export type Person = { id: string; full_name: string | null; email: string; role: string; org_name: string | null };

/* Everyone Relève could place. Admin only — row level security sees to that. */
export async function listPeople(): Promise<Person[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('profiles')
    .select('id, full_name, email, role, org_name')
    .in('role', ['client', 'talent'])
    .order('full_name', { ascending: true });
  return (data ?? []) as Person[];
}

export async function listAllPlacements():
  Promise<(Placement & { ended_on: string | null; notice_given_on: string | null })[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('id, client_id, talent_id, started_on, ended_on, ' +
            'terms:placement_terms(notice_given_on), ' +
            'client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .order('started_on', { ascending: false });
  return (data ?? []).map((r: any) => {
    const t = Array.isArray(r.terms) ? r.terms[0] : r.terms;
    return {
      id: r.id, client_id: r.client_id, talent_id: r.talent_id,
      started_on: r.started_on, ended_on: r.ended_on,
      notice_given_on: t?.notice_given_on ?? null,
      client_name: r.client?.full_name ?? 'Executive',
      talent_name: r.talent?.full_name ?? 'Talent',
      org_name: r.client?.org_name ?? null
    };
  });
}

export async function createPlacement(
  clientId: string, talentId: string, startedOn?: string | null, replacesId?: string | null
) {
  const sb = await supabaseServer();

  /* What the engine predicted for this pairing, captured now while it is still
     knowable. Six months from now the outcome gets scored against it, and the
     difference is the only thing that tells us whether the assessment works.
     Read from the match rather than recomputed, so it is the number the engine
     actually produced at the time. */
  const { data: m } = await sb.from('matches')
    .select('overall').eq('client_id', clientId).eq('talent_id', talentId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const { data: made, error } = await sb.from('placements').insert({
    client_id: clientId, talent_id: talentId,
    started_on: startedOn || new Date().toISOString().slice(0, 10),
    predicted_fit: m?.overall ?? null,
    /* Writing this is what settles a replacement guarantee. Nothing had ever
       written it, so every guaranteed ending stayed on the owed list for good
       and the list became noise. */
    replaces_id: replacesId || null,
    /* A brand new placement starts unrevealed on both sides, so whoever
       signs in next — client or talent — gets the Placement Reveal screen. */
    talent_reveal_seen: false,
    client_reveal_seen: false
  }).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  /* A placed person is no longer on the bench. */
  await sb.from('profiles').update({ stage: 'Placed' }).eq('id', talentId);
  return (made as any)?.id as string | undefined;
}

/* ---------- placement reveal ---------- */

export type PlacementRevealSide = 'talent' | 'client';

export type UnrevealedPlacement = {
  id: string; startedOn: string; roleTitle: string | null;
  /* The OTHER party — for a talent that's the client (executive) they were
     placed with; for a client it's the talent. */
  counterpartName: string;
  /* Only meaningful for side === 'client': the talent's own headline, used
     as the role-title fallback when the placement carries no offer. A
     talent's own fallback (their own headline) is looked up separately,
     right where side === 'talent' is already known — see
     app/placement-confirmed/page.tsx. */
  counterpartHeadline: string | null;
};

/** The most recent placement this person has not yet had revealed to them
    on their own side, or null. One indexed lookup, not the full placements
    list — safe to call on every page load for either side. */
export async function getUnrevealedPlacement(userId: string, side: PlacementRevealSide): Promise<UnrevealedPlacement | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const idCol = side === 'talent' ? 'talent_id' : 'client_id';
  const seenCol = side === 'talent' ? 'talent_reveal_seen' : 'client_reveal_seen';
  const counterpartSelect = side === 'talent' ? 'client:client_id(full_name)' : 'talent:talent_id(full_name, headline)';

  const { data } = await sb.from('placements')
    .select(`id, started_on, ${counterpartSelect}, offers(role_title)`)
    .eq(idCol, userId).eq(seenCol, false).is('ended_on', null)
    .order('started_on', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const r: any = data;
  const counterpart = side === 'talent' ? r.client : r.talent;

  return {
    id: r.id, startedOn: r.started_on,
    /* Only placements made from an accepted offer carry a role_title — a
       manually-created placement (the admin tool in PlacementMaker) has none,
       so the reveal screen falls back to a generic line rather than showing
       nothing. */
    roleTitle: r.offers?.[0]?.role_title ?? null,
    counterpartName: counterpart?.full_name ?? (side === 'talent' ? 'your new executive' : 'your new team member'),
    counterpartHeadline: side === 'client' ? (counterpart?.headline ?? null) : null
  };
}

/** Marks the reveal seen for the given side. Goes through
    mark_placement_reveal_seen() in the database rather than a plain update —
    placements are admin-write-only by RLS, and this is the one thing either
    side is allowed to change on their own row. */
export async function markRevealSeen(placementId: string, side: PlacementRevealSide) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.rpc('mark_placement_reveal_seen', { placement: placementId, side });
  if (error) throw new Error(error.message);
}

export async function endPlacement(id: string, endedOn?: string | null, reason?: string | null) {
  const sb = await supabaseServer();
  const patch: Record<string, unknown> = {
    ended_on: endedOn || new Date().toISOString().slice(0, 10)
  };
  /* Why it ended decides whether the replacement guarantee is owed, so it is
     recorded at the moment it is known rather than remembered later. */
  if (reason) patch.ended_reason = reason;
  const { data: row } = await sb.from('placements').select('talent_id').eq('id', id).maybeSingle();
  const { error } = await sb.from('placements').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  /* A talent can hold two placements at once (see schema PART 31), so freeing
     them for Bench/Matching only happens once none of their placements are
     still live — otherwise ending one silently pulled them off a job they're
     still doing. Without this, profiles.stage stayed 'Placed' forever and
     rankBench() excluded them from reassignment for good. */
  const talentId = (row as any)?.talent_id as string | undefined;
  if (talentId) {
    const { count } = await sb.from('placements')
      .select('id', { count: 'exact', head: true })
      .eq('talent_id', talentId).is('ended_on', null);
    if (!count) {
      await sb.from('profiles').update({ stage: 'Vetted' }).eq('id', talentId).eq('stage', 'Placed');
    }
  }
}

/* ---------- the placement file ---------- */

export type PlacementNote = {
  id: string; placement_id: string; author_id: string;
  body: string; kind: 'note' | 'call' | 'escalation' | 'review' | 'resolution'; created_at: string;
};

export async function getPlacement(id: string) {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('id, client_id, talent_id, started_on, ended_on, ended_reason, ended_note, csm_id, tsm_id, client:client_id(full_name, org_name, email, timezone), talent:talent_id(full_name, email, timezone, headline)')
    .eq('id', id).maybeSingle();
  if (!data) return null;
  const r: any = data;
  return {
    id: r.id, client_id: r.client_id, talent_id: r.talent_id,
    started_on: r.started_on, ended_on: r.ended_on,
    ended_reason: r.ended_reason as string | null, ended_note: r.ended_note as string | null,
    csm_id: (r.csm_id ?? null) as string | null, tsm_id: (r.tsm_id ?? null) as string | null,
    client_name: r.client?.full_name ?? 'Executive', client_email: r.client?.email ?? '',
    org_name: r.client?.org_name ?? null, client_tz: r.client?.timezone ?? null,
    talent_name: r.talent?.full_name ?? 'Talent', talent_email: r.talent?.email ?? '',
    talent_tz: r.talent?.timezone ?? null, talent_headline: r.talent?.headline ?? null
  };
}

export async function listNotes(placementId: string): Promise<PlacementNote[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('placement_notes').select('*')
    .eq('placement_id', placementId).order('created_at', { ascending: false });
  return (data ?? []) as PlacementNote[];
}

export async function addNote(row: { placement_id: string; author_id: string; body: string; kind?: string }) {
  const sb = await supabaseServer();
  const { error } = await sb.from('placement_notes').insert({
    placement_id: row.placement_id, author_id: row.author_id,
    body: row.body, kind: row.kind ?? 'note'
  });
  if (error) throw new Error(error.message);
}

/* Everything worth worrying about on one placement, worked out from the data
   rather than waiting for somebody to raise a hand. */
export function alertsFor(input: {
  tasks: Task[]; checkins: Checkin[]; startedOn: string; thisWeek: string;
}) {
  const out: { level: 'high' | 'watch'; text: string }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const filedThisWeek = input.checkins.some(c => c.week_ending === input.thisWeek);
  const isLateInWeek = new Date().getUTCDay() === 5 || new Date().getUTCDay() === 6;
  if (!filedThisWeek && isLateInWeek) out.push({ level: 'watch', text: 'No check-in filed for this week yet' });

  const missedRun = (() => {
    const weeks = new Set(input.checkins.map(c => c.week_ending));
    let miss = 0;
    for (let i = 1; i <= 3; i++) {
      const d = new Date(input.thisWeek + 'T00:00:00'); d.setUTCDate(d.getUTCDate() - 7 * i);
      if (!weeks.has(d.toISOString().slice(0, 10))) miss++;
    }
    return miss;
  })();
  if (missedRun >= 2) out.push({ level: 'high', text: `${missedRun} of the last 3 weekly check-ins missing` });

  const flagged = input.checkins.filter(c => c.needs_attention).slice(0, 3);
  flagged.forEach(c => out.push({
    level: 'high',
    text: `Check-in for week ending ${c.week_ending} raised a flag${c.blocked ? ` — "${c.blocked.slice(0, 70)}"` : ''}`
  }));

  const overdue = input.tasks.filter(t => !t.done && t.due_on && t.due_on < today);
  if (overdue.length >= 3) out.push({ level: 'high', text: `${overdue.length} tasks past their due date` });
  else if (overdue.length) out.push({ level: 'watch', text: `${overdue.length} task${overdue.length > 1 ? 's' : ''} overdue` });

  const daysIn = Math.floor((Date.now() - new Date(input.startedOn + 'T00:00:00').getTime()) / 86400000);
  if (daysIn >= 14 && input.tasks.length === 0)
    out.push({ level: 'high', text: 'Two weeks in and no work has been delegated at all' });

  const lowRapport = input.checkins.slice(0, 3).filter(c => (c.rapport ?? 5) <= 2).length;
  if (lowRapport >= 2) out.push({ level: 'high', text: 'Rapport rated 2 or below in two recent check-ins' });

  const heavy = input.checkins.slice(0, 3).filter(c => c.workload === 'heavy').length;
  if (heavy >= 2) out.push({ level: 'watch', text: 'Workload reported as unsustainable more than once' });

  if (daysIn >= 75 && daysIn <= 105)
    out.push({ level: 'watch', text: 'Approaching the end of the three-month minimum — worth a renewal conversation' });

  return out;
}

/* ---------- shortlist decisions ---------- */

export async function listDecisions(clientId: string): Promise<Decision[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('talent_decisions').select('*').eq('client_id', clientId);
  return (data ?? []) as Decision[];
}

export async function setDecision(row: {
  client_id: string; talent_id: string; state: DecisionState;
  reason?: string | null; note?: string | null;
  /* the team member who wrote down an answer given on a call; null when
     the executive answered in their own account */
  recorded_by?: string | null;
}) {
  const sb = await supabaseServer();
  const { error } = await sb.from('talent_decisions').upsert({
    client_id: row.client_id, talent_id: row.talent_id, state: row.state,
    reason: row.reason || null, note: row.note || null, decided_at: new Date().toISOString(),
    recorded_by: row.recorded_by ?? null
  }, { onConflict: 'client_id,talent_id' });
  if (error) throw new Error(error.message);
}

/* Every decision across every executive — what Relève learns from. */
export async function allDecisions() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('talent_decisions')
    .select('*, client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .order('decided_at', { ascending: false }).limit(200);
  return (data ?? []) as any[];
}

/* ---------- interview feedback ---------- */

export async function listFeedback(filter: { interviewId?: string; authorId?: string }) {
  if (!configured()) return [];
  const sb = await supabaseServer();
  let q = sb.from('interview_feedback').select('*');
  if (filter.interviewId) q = q.eq('interview_id', filter.interviewId);
  if (filter.authorId) q = q.eq('author_id', filter.authorId);
  const { data } = await q.order('created_at', { ascending: false });
  return (data ?? []) as InterviewFeedback[];
}

export async function allFeedback() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('interview_feedback')
    .select('*, interview:interview_id(starts_at, stage, client_id, talent_id)')
    .order('created_at', { ascending: false }).limit(200);
  return (data ?? []) as any[];
}

export async function saveFeedback(row: {
  interview_id: string; author_id: string; side: 'client' | 'talent';
  rating?: number | null; proceed?: string | null;
  strengths?: string | null; concerns?: string | null; notes?: string | null;
}) {
  const sb = await supabaseServer();
  const { error } = await sb.from('interview_feedback').upsert({
    interview_id: row.interview_id, author_id: row.author_id, side: row.side,
    rating: row.rating ?? null, proceed: row.proceed || null,
    strengths: row.strengths || null, concerns: row.concerns || null, notes: row.notes || null
  }, { onConflict: 'interview_id,author_id' });
  if (error) throw new Error(error.message);
}

/* ---------- vetting ---------- */

export async function listVetting(talentId: string): Promise<Vetting[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('vetting').select('*').eq('talent_id', talentId);
  return (data ?? []) as Vetting[];
}

/* Which of these people are fully verified — identity plus a signed
   agreement — for the console's matching table, so a release that the
   database will refuse is visible before the button is pressed. */
export async function verifiedSet(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!configured() || !ids.length) return out;
  const sb = await supabaseServer();
  const { data } = await sb.from('vetting').select('talent_id, kind, state, expires_on').in('talent_id', ids);
  const today = new Date().toISOString().slice(0, 10);
  const kinds = new Map<string, Set<string>>();
  for (const v of (data ?? []) as any[]) {
    if (v.state !== 'verified') continue;
    if (v.expires_on && v.expires_on < today) continue;
    if (!kinds.has(v.talent_id)) kinds.set(v.talent_id, new Set());
    kinds.get(v.talent_id)!.add(String(v.kind));
  }
  for (const [id, k] of kinds) if (k.has('identity') && k.has('agreement')) out.add(id);
  return out;
}

/* Everyone with something outstanding, for the Relève queue. */
export async function vettingQueue() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('vetting')
    .select('*, talent:talent_id(full_name, email, stage)')
    .order('submitted_at', { ascending: true, nullsFirst: false });
  return (data ?? []) as any[];
}

export async function recordVetting(row: {
  signed_on?: string | null;
  talent_id: string; kind: string; file_path: string; file_name: string;
  expires_on?: string | null; issued_by_team?: boolean; verified?: boolean;
}) {
  const sb = await supabaseServer();
  const { error } = await sb.from('vetting').upsert({
    talent_id: row.talent_id, kind: row.kind,
    state: row.verified ? 'verified' : 'submitted',
    file_path: row.file_path, file_name: row.file_name,
    issued_by_team: row.issued_by_team ?? false,
    expires_on: row.expires_on || null,
    signed_on: row.signed_on || null,
    submitted_at: new Date().toISOString(),
    verified_at: row.verified ? new Date().toISOString() : null,
    reject_reason: null
  }, { onConflict: 'talent_id,kind' });
  if (error) throw new Error(error.message);
}

export async function decideVetting(id: string, verdict: 'verified' | 'rejected',
  by: string, opts?: { reason?: string | null; note?: string | null; expires_on?: string | null }) {
  const sb = await supabaseServer();
  const { error } = await sb.from('vetting').update({
    state: verdict,
    verified_at: verdict === 'verified' ? new Date().toISOString() : null,
    verified_by: verdict === 'verified' ? by : null,
    reject_reason: verdict === 'rejected' ? (opts?.reason ?? null) : null,
    note: opts?.note ?? null,
    expires_on: opts?.expires_on || null
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* A short-lived link to a document. Never a public URL — these are passports. */
export async function vettingFileLink(path: string, seconds = 120) {
  const sb = await supabaseServer();
  const { data } = await sb.storage.from('vetting').createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}


/* ---------- who to tell ---------- */

/* Through team_emails(), a definer function: a talent, an executive or an
   anonymous applicant cannot see the admin rows in profiles, so reading them
   through their own session returned nobody and every "tell the team" email
   went to an empty list while reporting success. */
export async function teamEmails(): Promise<string[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('team_emails');
  if (error) { console.error('[teamEmails]', error.message); return []; }
  return ((data ?? []) as any[]).map(r => (typeof r === 'string' ? r : r?.email ?? r?.team_emails)).filter(Boolean);
}

/** `name` is the first name, for greeting someone in a letter. `full` is the
    whole thing, for records that other people will read. */
export async function personEmail(id: string): Promise<{ email: string; name: string; full: string } | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('profiles').select('email, full_name').eq('id', id).maybeSingle();
  if (!data) return null;
  const full = ((data as any).full_name ?? '').trim();
  return { email: (data as any).email, name: full.split(/\s+/)[0] || 'there', full: full || 'Executive' };
}


/* What Relève pays each of these people, for the console only. talent_pay has
   a single is_admin() policy, so a client session gets an empty map rather
   than a refusal.

   Since PART 31, a live placement's real pay lives on
   placement_terms.talent_pay_cents, not this roster row — showing the
   roster figure here made an already-placed person's pay look unchanged
   right after it actually changed (admin-console audit, P0, same bug as
   setTalentPay). This now prefers the single active placement's number when
   there is exactly one, and falls back to the roster row otherwise (not yet
   placed, or two placements at once — the roster row is the least-wrong
   single number to show until a per-placement editor exists). */
export async function benchPay(ids: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  if (!configured() || !ids.length) return out;
  const sb = await supabaseServer();
  const [{ data: roster }, { data: live }] = await Promise.all([
    sb.from('talent_pay').select('talent_id, rate_month, rate_month_cents').in('talent_id', ids),
    sb.from('placements').select('id, talent_id').in('talent_id', ids).is('ended_on', null)
  ]);
  /* rate_month_cents is the real column; the dollar one is deprecated and
     kept in step by trigger. Returned in dollars, which is what the page has
     always taken. */
  for (const r of (roster ?? []) as any[])
    out[r.talent_id] = r.rate_month_cents != null ? r.rate_month_cents / 100 : (r.rate_month ?? null);

  const byTalent = new Map<string, string[]>();
  for (const p of (live ?? []) as any[]) {
    const arr = byTalent.get(p.talent_id) ?? [];
    arr.push(p.id);
    byTalent.set(p.talent_id, arr);
  }
  const singlePlacement = [...byTalent.entries()].filter(([, ps]) => ps.length === 1).map(([, ps]) => ps[0]);
  if (singlePlacement.length) {
    const { data: terms } = await sb.from('placement_terms')
      .select('placement_id, talent_pay_cents').in('placement_id', singlePlacement);
    const byPlacement = new Map(((terms ?? []) as any[]).map(t => [t.placement_id, t.talent_pay_cents]));
    for (const [talentId, ps] of byTalent.entries()) {
      if (ps.length !== 1) continue;
      const cents = byPlacement.get(ps[0]);
      if (cents != null) out[talentId] = cents / 100;
    }
  }
  return out;
}
