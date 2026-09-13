/* TAKING THE WATCH — data layer.
   ---------------------------------
   A scored, time-boxed work simulation taken once at intake, before a
   talent is eligible to be matched (see talent_directory in schema.sql,
   which is the actual gate — this file is the read/write layer everything
   else calls through). Same shape as lib/attempts.ts: talent owns their own
   attempt while it is open, and the moment it is submitted, the database
   itself closes further writes — see the RLS policies and
   submit_watch_attempt() in schema.sql. */
import { configured, supabaseServer } from './supabase/server';
import { WATCH_TEMPLATES, watchTemplateFor, type WatchTemplate, type WatchTaskDef } from './watch-tasks';

export { WATCH_TEMPLATES, watchTemplateFor };
export type { WatchTemplate, WatchTaskDef };

/* ---------- talent side ---------- */

export type WatchStatus = 'not_started' | 'in_progress' | 'awaiting_review' | 'cleared' | 'needs_retake';

export type WatchDisciplineState = {
  discipline: string;
  status: WatchStatus;
  attemptId: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  timeLimitMinutes: number | null;
  talentFeedback: string | null;
};

/** One row per discipline the talent has claimed on their Discipline
    Breakdown — where they stand on Taking The Watch for each. A discipline
    with no task template yet (none currently — all twelve have one) would
    come back with status 'not_started' and a null time limit, so the app
    can say "not ready yet" rather than offer a broken Start button. */
export async function myWatchStatus(talentId: string, claimedDisciplines: string[]): Promise<WatchDisciplineState[]> {
  const empty = (discipline: string): WatchDisciplineState => ({
    discipline, status: 'not_started', attemptId: null, startedAt: null,
    submittedAt: null, timeLimitMinutes: watchTemplateFor(discipline)?.timeLimitMinutes ?? null,
    talentFeedback: null
  });
  if (!claimedDisciplines.length) return [];
  if (!configured()) return claimedDisciplines.map(empty);

  const sb = await supabaseServer();
  const { data } = await sb.from('my_watch_results').select('*')
    .in('discipline', claimedDisciplines)
    .order('started_at', { ascending: false });

  /* Most recent attempt per discipline wins — a re-take after "needs
     another attempt" leaves the earlier row in place, and this is what
     stops that earlier verdict from shadowing the new one. */
  const latest = new Map<string, any>();
  for (const r of (data ?? []) as any[]) if (!latest.has(r.discipline)) latest.set(r.discipline, r);

  return claimedDisciplines.map(discipline => {
    const r = latest.get(discipline);
    if (!r) return empty(discipline);
    let status: WatchStatus;
    if (r.overall_result === 'cleared') status = 'cleared';
    else if (r.overall_result === 'needs_retake') status = 'needs_retake';
    else if (r.status === 'submitted') status = 'awaiting_review';
    else status = 'in_progress';
    return {
      discipline, status, attemptId: r.attempt_id, startedAt: r.started_at,
      submittedAt: r.submitted_at,
      timeLimitMinutes: watchTemplateFor(discipline)?.timeLimitMinutes ?? null,
      talentFeedback: r.talent_feedback ?? null
    };
  });
}

/** Starts a new attempt, or hands back the one already open — a refresh or
    a double click should never look like an error. Throws if the
    discipline has no template (none do today, but a new discipline could
    be added to lib/disciplines.ts before its Taking The Watch content is
    written). */
export async function startWatchAttempt(talentId: string, discipline: string): Promise<string> {
  const template = watchTemplateFor(discipline);
  if (!template) throw new Error('There is no Taking The Watch task set for that discipline yet.');
  if (!configured()) return 'demo-attempt';

  const sb = await supabaseServer();
  /* "submitted" only means still open — awaiting review — while nobody has
     scored it yet. Once a reviewer has (cleared, or needs another attempt),
     the row stays "submitted" forever (nothing ever moves it on), so without
     this check "Start again" on a needs_retake discipline just handed back
     the same already-scored, now read-only attempt — a dead end with no way
     to actually retake it. */
  const { data: existing } = await sb.from('taking_the_watch_attempts')
    .select('id').eq('talent_id', talentId).eq('discipline', discipline)
    .in('status', ['in_progress', 'submitted'])
    .order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (existing) {
    const { data: scored } = await sb.from('taking_the_watch_scores')
      .select('attempt_id').eq('attempt_id', (existing as any).id).maybeSingle();
    if (!scored) return (existing as any).id as string;
  }

  const { data: attempt, error } = await sb.from('taking_the_watch_attempts')
    .insert({ talent_id: talentId, discipline, time_limit_minutes: template.timeLimitMinutes })
    .select('id').single();
  if (error) throw new Error(error.message);
  const attemptId = (attempt as any).id as string;

  const rows = template.tasks.map(t => ({ attempt_id: attemptId, task_key: t.key, prompt: t.prompt }));
  const { error: tErr } = await sb.from('taking_the_watch_tasks').insert(rows);
  if (tErr) throw new Error(tErr.message);

  return attemptId;
}

export type WatchAttemptDetail = {
  id: string; discipline: string; status: string; startedAt: string; submittedAt: string | null;
  timeLimitMinutes: number;
  tasks: { id: string; key: string; title: string; prompt: string; placeholder?: string; response: string | null }[];
};

/** The attempt as the talent taking it sees it — scoped to their own id, so
    this doubles as the ownership check every attempt-taking page needs. */
export async function getAttemptForTalent(attemptId: string, talentId: string): Promise<WatchAttemptDetail | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data: attempt } = await sb.from('taking_the_watch_attempts')
    .select('id, discipline, status, started_at, submitted_at, time_limit_minutes')
    .eq('id', attemptId).eq('talent_id', talentId).maybeSingle();
  if (!attempt) return null;
  const a: any = attempt;

  const { data: tasks } = await sb.from('taking_the_watch_tasks')
    .select('id, task_key, prompt, response').eq('attempt_id', attemptId);
  const template = watchTemplateFor(a.discipline);
  const defOf = (key: string) => template?.tasks.find(t => t.key === key);

  return {
    id: a.id, discipline: a.discipline, status: a.status, startedAt: a.started_at,
    submittedAt: a.submitted_at, timeLimitMinutes: a.time_limit_minutes,
    tasks: (tasks ?? []).map((t: any) => ({
      id: t.id, key: t.task_key, title: defOf(t.task_key)?.title ?? t.task_key,
      prompt: t.prompt, placeholder: defOf(t.task_key)?.placeholder, response: t.response
    }))
  };
}

/** Autosave for one task's response. RLS refuses this once the attempt is
    no longer in_progress, which shows up here as zero rows affected rather
    than a thrown error — surfaced explicitly, because a silent autosave
    failure on a timed exam is the single worst thing this screen could do. */
export async function saveTaskResponse(taskId: string, response: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { data, error } = await sb.from('taking_the_watch_tasks')
    .update({ response }).eq('id', taskId).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('This attempt is no longer open, so that answer was not saved. Refresh the page.');
}

/** Submits through submit_watch_attempt() — security definer, so it is the
    one thing still allowed to close an attempt out. Everything else on the
    two tables is locked the instant status flips. */
export async function submitWatchAttempt(attemptId: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.rpc('submit_watch_attempt', { attempt: attemptId });
  if (error) throw new Error(error.message);

  /* submit_watch_attempt() only updates a row that still belongs to the
     caller and is still in_progress — it does not raise when nothing
     matched (a stale id, an already-submitted attempt, someone else's
     row), so the call above can return with no error while nothing
     actually moved. Read the row back through the caller's own session
     (the same read policy that lets a talent see their own attempt) so a
     silent no-op is reported as the failure it is, rather than the false
     "ok" a flaky connection or a double-submit would otherwise produce. */
  const { data: after } = await sb.from('taking_the_watch_attempts')
    .select('status').eq('id', attemptId).maybeSingle();
  if (after?.status !== 'submitted')
    throw new Error('That attempt could not be submitted — refresh the page and check its status before trying again.');
}

/* ---------- console side ---------- */

export type WatchQueueRow = {
  attemptId: string; talentId: string; talentName: string; discipline: string;
  startedAt: string; submittedAt: string; timeLimitMinutes: number;
};

/** Everything submitted and still waiting on a reviewer, oldest first. */
export async function watchReviewQueue(): Promise<WatchQueueRow[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('watch_review_queue').select('*');
  return (data ?? []).map((r: any) => ({
    attemptId: r.attempt_id, talentId: r.talent_id, talentName: r.talent_name ?? 'Talent',
    discipline: r.discipline, startedAt: r.started_at, submittedAt: r.submitted_at,
    timeLimitMinutes: r.time_limit_minutes
  }));
}

export type WatchScorePatch = {
  accuracy: number; judgment: number; communication: number; time_management: number;
  overall_result: 'cleared' | 'needs_retake';
  reviewer_notes?: string | null;
  talent_feedback: string;
};

export type WatchAttemptForReview = {
  id: string; talentId: string; talentName: string; discipline: string;
  startedAt: string; submittedAt: string | null; timeLimitMinutes: number;
  tasks: { id: string; key: string; title: string; prompt: string; response: string | null; submittedAt: string | null }[];
  existingScore: (WatchScorePatch & { scored_at: string | null }) | null;
};

/** The full attempt for the reviewer — every response, plus whatever score
    already exists so re-opening a scored attempt shows what was decided
    rather than a blank form. */
export async function getAttemptForReview(attemptId: string): Promise<WatchAttemptForReview | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data: attempt } = await sb.from('taking_the_watch_attempts')
    .select('id, talent_id, discipline, started_at, submitted_at, time_limit_minutes, talent:talent_id(full_name)')
    .eq('id', attemptId).maybeSingle();
  if (!attempt) return null;
  const a: any = attempt;

  const [{ data: tasks }, { data: score }] = await Promise.all([
    sb.from('taking_the_watch_tasks').select('id, task_key, prompt, response, submitted_at').eq('attempt_id', attemptId),
    sb.from('taking_the_watch_scores').select('*').eq('attempt_id', attemptId).maybeSingle()
  ]);
  const template = watchTemplateFor(a.discipline);
  const titleFor = (key: string) => template?.tasks.find(t => t.key === key)?.title ?? key;
  const s: any = score;

  return {
    id: a.id, talentId: a.talent_id, talentName: a.talent?.full_name ?? 'Talent',
    discipline: a.discipline, startedAt: a.started_at, submittedAt: a.submitted_at,
    timeLimitMinutes: a.time_limit_minutes,
    tasks: (tasks ?? []).map((t: any) => ({
      id: t.id, key: t.task_key, title: titleFor(t.task_key),
      prompt: t.prompt, response: t.response, submittedAt: t.submitted_at
    })),
    existingScore: s ? {
      accuracy: s.accuracy, judgment: s.judgment, communication: s.communication,
      time_management: s.time_management, overall_result: s.overall_result,
      reviewer_notes: s.reviewer_notes, talent_feedback: s.talent_feedback ?? '',
      scored_at: s.scored_at
    } : null
  };
}

/** Records or updates the score. One row per attempt — scoring the same
    attempt twice (re-opening to fix a typo) updates it in place rather than
    creating a second verdict. */
export async function scoreWatchAttempt(attemptId: string, reviewerId: string, patch: WatchScorePatch) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('taking_the_watch_scores').upsert({
    attempt_id: attemptId,
    accuracy: patch.accuracy, judgment: patch.judgment,
    communication: patch.communication, time_management: patch.time_management,
    overall_result: patch.overall_result,
    reviewer_id: reviewerId, reviewer_notes: patch.reviewer_notes ?? null,
    talent_feedback: patch.talent_feedback,
    scored_at: new Date().toISOString()
  }, { onConflict: 'attempt_id' });
  if (error) throw new Error(error.message);
}
