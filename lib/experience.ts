/* The experience layer, server side: who looks after you, what is unread,
   the daily log, the executive's briefing, client requests and the month's
   report. Reads go through the signed-in person's session, so row level
   security (supabase/part39-experience.sql) decides what comes back. The
   few reads no signed-in person may make (a manager's email address, every
   placement for a scheduled job) use the service role, server side only. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { configured, supabaseServer, type Profile } from './supabase/server';
import { teamEmails } from './work';
import { WORDS } from './words';
import {
  TEAM_FALLBACK, monthStart, todayIn,
  type ClientRequest, type DailyLog, type Manager, type MonthReport, type RequestKind,
  type TalentBrief, type ThreadKey
} from './experience-public';

export * from './experience-public';

/* ---------- the service role, for the few reads nobody signed in may make ---------- */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           ?? process.env.SUPABASE_SECRET_KEY
           ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ---------- the named Success Manager ---------- */

const titleFor = (side: 'client' | 'talent') => side === 'client' ? WORDS.csm : WORDS.tsm;

function fallbackManager(side: 'client' | 'talent', placementId: string | null = null): Manager {
  return { placement_id: placementId, id: null, name: TEAM_FALLBACK, title: titleFor(side), photo: null };
}

/** The manager assigned to each of this person's live placements: the CSM
    for an executive, the TSM for talent. Unassigned placements come back as
    "The Relève team" so the screen never shows an empty name. */
export async function myManagers(profile: Profile): Promise<Manager[]> {
  const side = profile.role === 'client' ? 'client' : 'talent';
  if (!configured() || profile.role === 'admin') return [];
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.rpc('my_managers');
    if (error) return [];
    return ((data ?? []) as any[])
      .filter(r => r.side === side)
      .map(r => ({
        placement_id: r.placement_id, id: r.manager_id,
        name: (r.manager_name ?? '').trim() || TEAM_FALLBACK,
        title: titleFor(side),
        photo: r.has_photo ? `/api/manager-photo?u=${r.manager_id}` : null
      }));
  } catch { return []; }
}

/** One manager to name on a screen that is not about a specific placement
    (the Messages page, the dashboard): the first assigned one, or the team. */
export async function primaryManager(profile: Profile, placementId?: string | null): Promise<Manager> {
  const side = profile.role === 'client' ? 'client' : 'talent';
  const all = await myManagers(profile);
  if (placementId) {
    const hit = all.find(m => m.placement_id === placementId);
    if (hit) return hit;
  }
  return all[0] ?? fallbackManager(side, placementId ?? null);
}

/** Who should hear that this person wrote in: their assigned manager(s),
    or every admin when nobody is assigned. Read with the service role
    because a client's session cannot see a team member's email. */
export async function managerEmailsFor(personId: string, role: 'client' | 'talent' | 'admin'): Promise<string[]> {
  const sv = serviceClient();
  if (sv && role !== 'admin') {
    try {
      const col = role === 'client' ? 'client_id' : 'talent_id';
      const mgr = role === 'client' ? 'csm_id' : 'tsm_id';
      const { data: rows } = await sv.from('placements').select(mgr)
        .eq(col, personId).is('ended_on', null);
      const ids = [...new Set(((rows ?? []) as any[]).map(r => r[mgr]).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: ppl } = await sv.from('profiles').select('email, role').in('id', ids);
        const out = ((ppl ?? []) as any[]).filter(p => p.role === 'admin' && p.email).map(p => p.email as string);
        if (out.length) return out;
      }
    } catch { /* fall through to the whole team */ }
  }
  return teamEmails();
}

/* ---------- read state ---------- */

/** Unread messages per thread for whoever is signed in. */
export async function unreadByThread(): Promise<Record<string, number>> {
  if (!configured()) return {};
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.rpc('my_unread');
    if (error) return {};
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as any[]) out[r.thread] = Number(r.unread) || 0;
    return out;
  } catch { return {}; }
}

export async function unreadTotal(): Promise<number> {
  const by = await unreadByThread();
  return Object.values(by).reduce((s, n) => s + n, 0);
}

/** For the console's badge: messages written to Relève that no one on the
    team has opened yet. Counted per message, the same way everywhere. */
export async function teamUnreadCount(): Promise<number> {
  if (!configured()) return 0;
  try {
    const sb = await supabaseServer();
    const { count } = await sb.from('messages').select('id', { count: 'exact', head: true })
      .eq('from_team', false).is('read_at', null).is('placement_id', null);
    return count ?? 0;
  } catch { return 0; }
}

/** Records that this person has read a thread up to now. Never throws: a
    read receipt that fails must not stop the conversation loading. */
export async function markRead(userId: string, thread: ThreadKey) {
  if (!configured()) return;
  try {
    const sb = await supabaseServer();
    await sb.from('message_reads').upsert(
      { user_id: userId, thread, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,thread' });
  } catch { /* the thread still opens */ }
}

/* ---------- the console: placement threads and "mine" ---------- */

export type PlacementThread = {
  placement_id: string; client_name: string; org_name: string | null; talent_name: string;
  last: string; last_at: string; total: number; csm_id: string | null; tsm_id: string | null;
};

export async function placementThreadList(): Promise<PlacementThread[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data: rows, error } = await sb.rpc('placement_threads');
  if (error || !rows?.length) return [];
  const ids = (rows as any[]).map(r => r.placement_id);
  const { data: pls } = await sb.from('placements')
    .select('id, csm_id, tsm_id, client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .in('id', ids);
  const byId = new Map(((pls ?? []) as any[]).map(p => [p.id, p]));
  return (rows as any[]).map(r => {
    const p = byId.get(r.placement_id);
    return {
      placement_id: r.placement_id,
      client_name: p?.client?.full_name ?? 'Executive',
      org_name: p?.client?.org_name ?? null,
      talent_name: p?.talent?.full_name ?? 'Talent',
      last: r.last, last_at: r.last_at, total: r.total ?? 0,
      csm_id: p?.csm_id ?? null, tsm_id: p?.tsm_id ?? null
    };
  }).sort((a, b) => +new Date(b.last_at) - +new Date(a.last_at));
}

/** Everything one manager looks after: the placements where they are the
    CSM or the TSM, and the people on them. Drives every "Mine" filter. */
export async function mineFor(adminId: string): Promise<{
  placements: Set<string>; clients: Set<string>; talent: Set<string>;
}> {
  const out = { placements: new Set<string>(), clients: new Set<string>(), talent: new Set<string>() };
  if (!configured()) return out;
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('id, client_id, talent_id, csm_id, tsm_id, ended_on')
    .or(`csm_id.eq.${adminId},tsm_id.eq.${adminId}`);
  for (const p of (data ?? []) as any[]) {
    if (p.ended_on) continue;
    out.placements.add(p.id);
    if (p.csm_id === adminId) out.clients.add(p.client_id);
    if (p.tsm_id === adminId) out.talent.add(p.talent_id);
  }
  return out;
}

/* ---------- the daily log ---------- */

export async function listLogs(talentId: string, limit = 30): Promise<DailyLog[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('talent_logs').select('*')
    .eq('talent_id', talentId).order('log_date', { ascending: false }).limit(limit);
  return ((data ?? []) as any[]).map(r => ({ ...r, hours: r.hours == null ? null : Number(r.hours) })) as DailyLog[];
}

export async function saveLog(row: {
  placement_id: string; talent_id: string; log_date: string;
  done_text?: string | null; hours?: number | null; blockers?: string | null;
  highlight?: string | null; share_highlight?: boolean;
}) {
  const sb = await supabaseServer();
  const { data, error } = await sb.from('talent_logs').upsert({
    placement_id: row.placement_id, talent_id: row.talent_id, log_date: row.log_date,
    done_text: row.done_text?.trim() || null,
    hours: row.hours ?? null,
    blockers: row.blockers?.trim() || null,
    highlight: row.highlight?.trim() || null,
    share_highlight: !!row.share_highlight && !!row.highlight?.trim(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'placement_id,log_date' }).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That log was not saved. It may be for a placement that has ended.');
}

/* ---------- the executive's briefing ---------- */

export async function getBrief(placementId: string): Promise<TalentBrief | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('talent_briefs').select('*').eq('placement_id', placementId).maybeSingle();
  return (data as TalentBrief) ?? null;
}

export async function saveBrief(placementId: string, by: string, patch: Partial<TalentBrief>) {
  const sb = await supabaseServer();
  const clean = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, 4000) : null;
  };
  const { data, error } = await sb.from('talent_briefs').upsert({
    placement_id: placementId,
    tools: clean(patch.tools), access: clean(patch.access), preferences: clean(patch.preferences),
    rhythm: clean(patch.rhythm), ask_first: clean(patch.ask_first),
    updated_at: new Date().toISOString(), updated_by: by
  }, { onConflict: 'placement_id' }).select('placement_id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Only the executive on this placement, or Relève, can change the briefing.');
}

/* ---------- client requests ---------- */

export async function myRequests(clientId: string): Promise<ClientRequest[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('client_requests').select('*')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(20);
  return (data ?? []) as ClientRequest[];
}

export async function createRequest(row: {
  placement_id: string; client_id: string; kind: RequestKind;
  note?: string | null; preferred?: string | null; pause_from?: string | null; pause_until?: string | null;
}) {
  const sb = await supabaseServer();
  const { data, error } = await sb.from('client_requests').insert({
    placement_id: row.placement_id, client_id: row.client_id, kind: row.kind,
    note: row.note?.trim().slice(0, 4000) || null,
    preferred: row.preferred?.trim().slice(0, 400) || null,
    pause_from: row.pause_from || null, pause_until: row.pause_until || null
  }).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as any)?.id as string | undefined;
}

export type RequestRow = ClientRequest & {
  client_name: string; org_name: string | null; talent_name: string; csm_id: string | null; tsm_id: string | null;
};

export async function allRequests(limit = 60): Promise<RequestRow[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('client_requests')
    .select('*, placement:placement_id(csm_id, tsm_id, client:client_id(full_name, org_name), talent:talent_id(full_name))')
    .order('created_at', { ascending: false }).limit(limit);
  return ((data ?? []) as any[]).map(r => ({
    ...r,
    client_name: r.placement?.client?.full_name ?? 'Executive',
    org_name: r.placement?.client?.org_name ?? null,
    talent_name: r.placement?.talent?.full_name ?? 'Talent',
    csm_id: r.placement?.csm_id ?? null, tsm_id: r.placement?.tsm_id ?? null
  })) as RequestRow[];
}

export async function updateRequest(id: string, by: string, patch: { state: string; outcome?: string | null }) {
  const sb = await supabaseServer();
  const { data, error } = await sb.from('client_requests').update({
    state: patch.state, outcome: patch.outcome?.trim() || null,
    handled_at: new Date().toISOString(), handled_by: by
  }).eq('id', id).select('id, client_id, kind, state').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That request could not be updated.');
  return data as { id: string; client_id: string; kind: RequestKind; state: string };
}

/* ---------- the month's report ---------- */

/** One placement's month, as the executive sees it. Takes a client so the
    scheduled email can build the same report with the service role. */
export async function monthReport(
  placementId: string, month: string, opts?: { sb?: SupabaseClient; talentName?: string }
): Promise<MonthReport> {
  const m = monthStart(month);
  const next = (() => { const d = new Date(m + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })();
  const empty: MonthReport = {
    placement_id: placementId, talent_name: opts?.talentName ?? 'Your talent', month: m,
    completed: [], open: 0, highlights: [], hours: 0, daysLogged: 0, timeAway: [], pulse: null, focus: []
  };
  if (!configured()) return empty;
  const sb: SupabaseClient = opts?.sb ?? (await supabaseServer()) as unknown as SupabaseClient;

  const [done, open, log, off, pulse] = await Promise.all([
    sb.from('tasks').select('id, title, done_at')
      .eq('placement_id', placementId).eq('done', true)
      .gte('done_at', m + 'T00:00:00Z').lt('done_at', next + 'T00:00:00Z')
      .order('done_at', { ascending: true }).limit(200),
    sb.from('tasks').select('id, title, due_on, priority')
      .eq('placement_id', placementId).eq('done', false)
      .order('due_on', { ascending: true, nullsFirst: false }).limit(50),
    sb.rpc('placement_month_log', { p_placement: placementId, p_month: m }),
    sb.from('time_off').select('starts_on, ends_on, state')
      .eq('placement_id', placementId).in('state', ['approved', 'requested'])
      .lt('starts_on', next).gte('ends_on', m).order('starts_on'),
    sb.from('client_pulse').select('going, standout, friction')
      .eq('placement_id', placementId).eq('month_of', m).maybeSingle()
  ]);

  const logRows = ((log.data ?? []) as any[]);
  const priOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const openRows = ((open.data ?? []) as any[]);
  const focus = [...openRows]
    .sort((a, b) => (priOrder[a.priority] ?? 2) - (priOrder[b.priority] ?? 2)
      || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))
    .slice(0, 5);

  return {
    ...empty,
    completed: ((done.data ?? []) as any[]).map(t => ({ id: t.id, title: t.title, done_at: t.done_at })),
    open: openRows.length,
    highlights: logRows.filter(r => r.highlight).map(r => ({ date: r.log_date, text: r.highlight })),
    hours: Math.round(logRows.reduce((s, r) => s + (Number(r.hours) || 0), 0) * 10) / 10,
    daysLogged: logRows.filter(r => r.hours != null).length,
    timeAway: ((off.data ?? []) as any[]).map(o => ({ from: o.starts_on, to: o.ends_on, state: o.state })),
    pulse: (pulse.data as any) ?? null,
    focus: focus.map(t => ({ id: t.id, title: t.title, due_on: t.due_on, priority: t.priority }))
  };
}

/** The months a report can be read for: from the month the placement
    started to the current one, newest first, capped at two years. */
export function reportMonths(startedOn: string, tz?: string | null): string[] {
  const out: string[] = [];
  let cur = monthStart(todayIn(tz));
  const first = monthStart(startedOn);
  while (cur >= first && out.length < 24) {
    out.push(cur);
    const d = new Date(cur + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1);
    cur = d.toISOString().slice(0, 10);
  }
  return out.length ? out : [monthStart(todayIn(tz))];
}

/** Today in this person's own timezone, read from their profile. */
export async function viewerTimezone(userId: string): Promise<string | null> {
  if (!configured()) return null;
  try {
    const sb = await supabaseServer();
    const { data } = await sb.from('profiles').select('timezone').eq('id', userId).maybeSingle();
    const tz = (data as any)?.timezone as string | null;
    if (!tz) return null;
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });   // throws on a bad name
    return tz;
  } catch { return null; }
}

