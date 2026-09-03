/* The care layer: everything that keeps a placement healthy after it starts.
   Reads go through the signed-in person's session, so row level security
   decides what comes back. */
import { configured, supabaseServer } from './supabase/server';
import type {
  EndedReason, Feedback, Pulse, Step, TeamRole, TimeOff, TimeOffState, Workload
} from './care-public';
import { monthOf } from './care-public';

export * from './care-public';

/* ---------- the team ---------- */

export async function teamRoles() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('team_roles')
    .select('user_id, team_role, added_at, person:user_id(full_name, email)');
  return (data ?? []).map((r: any) => ({
    user_id: r.user_id, team_role: r.team_role as TeamRole, added_at: r.added_at,
    name: r.person?.full_name ?? r.person?.email ?? 'Someone',
    email: r.person?.email ?? ''
  }));
}

export async function setTeamRole(userId: string, role: TeamRole) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('team_roles')
    .upsert({ user_id: userId, team_role: role }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

export async function assignManagers(placementId: string, csm: string | null, tsm: string | null) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('placements')
    .update({ csm_id: csm, tsm_id: tsm }).eq('id', placementId);
  if (error) throw new Error(error.message);
}

/* ---------- the executive's monthly pulse ---------- */

export async function pulseFor(placementId: string, month = monthOf()): Promise<Pulse | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('client_pulse').select('*')
    .eq('placement_id', placementId).eq('month_of', month).maybeSingle();
  return (data ?? null) as Pulse | null;
}

export async function savePulse(p: {
  placement_id: string; month_of?: string; going: number; workload: Workload;
  standout?: string; friction?: string; keep_going: boolean;
}) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('client_pulse').upsert({
    placement_id: p.placement_id, month_of: p.month_of ?? monthOf(),
    going: p.going, workload: p.workload,
    standout: p.standout?.trim() || null, friction: p.friction?.trim() || null,
    keep_going: p.keep_going, filed_at: new Date().toISOString()
  }, { onConflict: 'placement_id,month_of' });
  if (error) throw new Error(error.message);
}

export async function allPulses(limit = 200): Promise<Pulse[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('client_pulse')
    .select('*, placement:placement_id(client:client_id(full_name, org_name), talent:talent_id(full_name))')
    .order('filed_at', { ascending: false }).limit(limit);
  return (data ?? []).map((r: any) => ({
    ...r,
    client_name: r.placement?.client?.full_name ?? 'Client',
    org_name: r.placement?.client?.org_name ?? null,
    talent_name: r.placement?.talent?.full_name ?? 'Talent'
  })) as Pulse[];
}

/* ---------- time off ---------- */

export async function timeOffFor(placementId: string): Promise<TimeOff[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('time_off').select('*')
    .eq('placement_id', placementId).order('starts_on', { ascending: false });
  return (data ?? []) as TimeOff[];
}

export async function requestTimeOff(a: {
  placement_id: string; starts_on: string; ends_on: string; reason?: string;
}) {
  if (!configured()) return;
  if (a.ends_on < a.starts_on) throw new Error('the last day cannot be before the first');
  const sb = await supabaseServer();
  const { error } = await sb.from('time_off').insert({
    placement_id: a.placement_id, starts_on: a.starts_on, ends_on: a.ends_on,
    reason: a.reason?.trim() || null
  });
  if (error) throw new Error(error.message);
}

export async function decideTimeOff(id: string, state: TimeOffState, coverNote?: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('time_off').update({
    state, cover_note: coverNote?.trim() || null, decided_at: new Date().toISOString()
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* Time off starting in the next few weeks, so cover can be arranged rather
   than discovered on the morning. */
export async function upcomingTimeOff(days = 30): Promise<TimeOff[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const until = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb.from('time_off')
    .select('*, placement:placement_id(client:client_id(full_name, org_name), talent:talent_id(full_name))')
    .in('state', ['requested', 'approved'])
    .gte('ends_on', new Date().toISOString().slice(0, 10))
    .lte('starts_on', until)
    .order('starts_on');
  return (data ?? []).map((r: any) => ({
    ...r,
    talent_name: r.placement?.talent?.full_name ?? 'Talent',
    client_name: r.placement?.client?.full_name ?? 'Client',
    org_name: r.placement?.client?.org_name ?? null
  })) as TimeOff[];
}

/* ---------- feedback the talent can see ---------- */

export async function feedbackFor(talentId: string): Promise<Feedback[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('talent_feedback').select('*')
    .eq('talent_id', talentId).order('written_at', { ascending: false });
  return (data ?? []) as Feedback[];
}

export async function saveFeedback(f: {
  id?: string; placement_id: string; talent_id: string; period: string;
  strengths: string; growing?: string;
  quality?: number; communication?: number; ownership?: number; shared?: boolean;
}) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const row: any = {
    placement_id: f.placement_id, talent_id: f.talent_id, period: f.period,
    strengths: f.strengths.trim(), growing: f.growing?.trim() || null,
    quality: f.quality ?? null, communication: f.communication ?? null,
    ownership: f.ownership ?? null, shared: f.shared ?? false
  };
  if (f.id) row.id = f.id;
  const { error } = await sb.from('talent_feedback').upsert(row);
  if (error) throw new Error(error.message);
}

/* Written first, released deliberately. A half-finished review appearing in
   someone's account is worse than no review. */
export async function shareFeedback(id: string, shared: boolean) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('talent_feedback').update({ shared }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markFeedbackSeen(id: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  await sb.from('talent_feedback')
    .update({ seen_at: new Date().toISOString() }).eq('id', id).is('seen_at', null);
}

/* ---------- the first fortnight ---------- */

export async function stepsFor(placementId: string): Promise<Step[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('onboarding_steps').select('*')
    .eq('placement_id', placementId).order('sort');
  return (data ?? []) as Step[];
}

export async function tickStep(id: string, done: boolean) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('onboarding_steps')
    .update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* ---------- the calibration loop ---------- */

/* Written when the placement is made, from the engine's own ranking. Without
   it there is nothing to compare the six-month outcome against. */
export async function recordPrediction(placementId: string, fit: number) {
  if (!configured()) return;
  const sb = await supabaseServer();
  await sb.from('placements')
    .update({ predicted_fit: Math.round(fit) }).eq('id', placementId).is('predicted_fit', null);
}

export async function recordOutcome(placementId: string, a: {
  outcome_score: number; retained: boolean; note?: string;
}) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('placements').update({
    outcome_score: a.outcome_score, retained: a.retained,
    review_note: a.note?.trim() || null,
    reviewed_on: new Date().toISOString().slice(0, 10)
  }).eq('id', placementId);
  if (error) throw new Error(error.message);
}

export async function reviewsDue() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('id, started_on, review_due_on, predicted_fit, client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .is('reviewed_on', null)
    .lte('review_due_on', new Date().toISOString().slice(0, 10))
    .order('review_due_on');
  return (data ?? []).map((r: any) => ({
    id: r.id, started_on: r.started_on, review_due_on: r.review_due_on,
    predicted_fit: r.predicted_fit,
    client_name: r.client?.org_name ?? r.client?.full_name ?? 'Client',
    talent_name: r.talent?.full_name ?? 'Talent'
  }));
}

export async function calibration() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('calibration').select('*').order('reviewed_on', { ascending: false });
  return (data ?? []) as any[];
}

/* ---------- the replacement guarantee ---------- */

export async function endPlacementWithReason(id: string, reason: EndedReason, on?: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('placements').update({
    ended_on: on ?? new Date().toISOString().slice(0, 10), ended_reason: reason
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markFirstCandidate(searchId: string, on?: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  await sb.from('searches')
    .update({ first_candidate_on: on ?? new Date().toISOString().slice(0, 10) })
    .eq('id', searchId).is('first_candidate_on', null);
}

/* Searches approaching or past the 14-day promise with nobody put forward. */
export async function guaranteeWatch() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('guarantee_watch').select('*');
  return (data ?? []) as any[];
}

/* Placements that ended in a way that owes the client a free replacement. */
export async function replacementsOwed() {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('id, client_id, ended_on, ended_reason, client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .in('ended_reason', ['talent_left', 'not_working'])
    .not('ended_on', 'is', null)
    .order('ended_on', { ascending: false });

  /* One that has already been replaced is settled. */
  const ids = (data ?? []).map((r: any) => r.id);
  if (!ids.length) return [];
  const { data: replaced } = await sb.from('placements')
    .select('replaces_id').in('replaces_id', ids);
  const settled = new Set((replaced ?? []).map((r: any) => r.replaces_id));

  return (data ?? []).filter((r: any) => !settled.has(r.id)).map((r: any) => ({
    id: r.id, ended_on: r.ended_on, ended_reason: r.ended_reason,
    client_name: r.client?.org_name ?? r.client?.full_name ?? 'Client',
    talent_name: r.talent?.full_name ?? 'Talent'
  }));
}

/* ---------- the audit trail ---------- */

export async function auditTrail(limit = 200) {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('audit_log')
    .select('id, at, actor_email, action, subject, subject_id, detail')
    .order('at', { ascending: false }).limit(limit);
  return (data ?? []) as any[];
}
