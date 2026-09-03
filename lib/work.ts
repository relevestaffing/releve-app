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
  const { error } = await sb.from('tasks').update(body).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTask(id: string) {
  const sb = await supabaseServer();
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
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

export async function sendMessage(row: {
  subject_id: string; sender_id: string; body: string; from_team: boolean;
}) {
  const sb = await supabaseServer();
  const { error } = await sb.from('messages').insert(row);
  if (error) throw new Error(error.message);
}

/* Every thread with its latest line — the Relève inbox. */
export async function listThreads() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('messages')
    .select('*, subject:subject_id(full_name, email, role, org_name)')
    .order('created_at', { ascending: false }).limit(400);
  const seen = new Map<string, any>();
  (data ?? []).forEach((m: any) => {
    if (!seen.has(m.subject_id)) seen.set(m.subject_id, {
      subject_id: m.subject_id,
      name: m.subject?.full_name ?? m.subject?.email ?? 'Someone',
      role: m.subject?.role ?? 'talent',
      org_name: m.subject?.org_name ?? null,
      last: m.body, last_at: m.created_at,
      waiting: !m.from_team          // their last word — Relève owes a reply
    });
  });
  return [...seen.values()];
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

export async function listAllPlacements(): Promise<(Placement & { ended_on: string | null })[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('id, client_id, talent_id, started_on, ended_on, client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .order('started_on', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, client_id: r.client_id, talent_id: r.talent_id,
    started_on: r.started_on, ended_on: r.ended_on,
    client_name: r.client?.full_name ?? 'Executive',
    talent_name: r.talent?.full_name ?? 'Talent',
    org_name: r.client?.org_name ?? null
  }));
}

export async function createPlacement(clientId: string, talentId: string, startedOn?: string | null) {
  const sb = await supabaseServer();

  /* What the engine predicted for this pairing, captured now while it is still
     knowable. Six months from now the outcome gets scored against it, and the
     difference is the only thing that tells us whether the assessment works.
     Read from the match rather than recomputed, so it is the number the engine
     actually produced at the time. */
  const { data: m } = await sb.from('matches')
    .select('overall').eq('client_id', clientId).eq('talent_id', talentId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const { error } = await sb.from('placements').insert({
    client_id: clientId, talent_id: talentId,
    started_on: startedOn || new Date().toISOString().slice(0, 10),
    predicted_fit: m?.overall ?? null
  });
  if (error) throw new Error(error.message);
  /* A placed person is no longer on the bench. */
  await sb.from('profiles').update({ stage: 'Placed' }).eq('id', talentId);
}

export async function endPlacement(id: string, endedOn?: string | null, reason?: string | null) {
  const sb = await supabaseServer();
  const patch: Record<string, unknown> = {
    ended_on: endedOn || new Date().toISOString().slice(0, 10)
  };
  /* Why it ended decides whether the replacement guarantee is owed, so it is
     recorded at the moment it is known rather than remembered later. */
  if (reason) patch.ended_reason = reason;
  const { error } = await sb.from('placements').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
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
}) {
  const sb = await supabaseServer();
  const { error } = await sb.from('talent_decisions').upsert({
    client_id: row.client_id, talent_id: row.talent_id, state: row.state,
    reason: row.reason || null, note: row.note || null, decided_at: new Date().toISOString()
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

export async function teamEmails(): Promise<string[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('profiles').select('email').eq('role', 'admin');
  return (data ?? []).map((r: any) => r.email).filter(Boolean);
}

export async function personEmail(id: string): Promise<{ email: string; name: string } | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('profiles').select('email, full_name').eq('id', id).maybeSingle();
  if (!data) return null;
  return { email: (data as any).email, name: ((data as any).full_name ?? '').split(' ')[0] || 'there' };
}


/* What Relève pays each of these people, for the console only. talent_pay has
   a single is_admin() policy, so a client session gets an empty map rather
   than a refusal. */
export async function benchPay(ids: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  if (!configured() || !ids.length) return out;
  const sb = await supabaseServer();
  const { data } = await sb.from('talent_pay').select('talent_id, rate_month').in('talent_id', ids);
  for (const r of (data ?? []) as any[]) out[r.talent_id] = r.rate_month ?? null;
  return out;
}
