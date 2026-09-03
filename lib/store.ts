/* People, matches, interviews and availability.
   Supabase when configured; an in-memory store in demo mode so the
   console is fully clickable before any account exists. */
import { configured, supabaseServer } from './supabase/server';
import { DEMO_BENCH, DEMO_EXEC } from './demo';
import { DEFAULT_WINDOWS, type Availability, type Window } from './scheduling';

export type InterviewStatus = 'Proposed' | 'Confirmed' | 'Declined' | 'Completed' | 'No-show' | 'Cancelled';
export type Interview = {
  id: string; client_id: string; talent_id: string;
  client_name: string; talent_name: string;
  stage: string; starts_at: string; duration_min: number;
  status: InterviewStatus; meeting_url: string | null; meeting_id: string | null;
  notes: string | null; created_at: string;
};
export type MatchRow = {
  id: string; client_id: string; talent_id: string;
  overall: number | null; manual: boolean; released: boolean;
  client_state: string | null;
};
/* The role a client is hiring for. Captured by the Relève team on the intro
   call — an executive is never asked to fill in a form about their own search. */
export type RoleBrief = {
  client_key: string;                 // profile id, or the pending record's id
  role_title: string;
  scope?: string;                     // what the person will own
  hours?: string;                     // hours a week, and which hours
  tools?: string;                     // the stack they must be fluent in
  target_at?: string;                 // when it needs to start
  stage?: string;                     // Sourcing | Shortlisted | Interviewing | Placed
  updated_at?: string;
};
export type ClientRow = {
  key: string; full_name: string; email: string; org_name: string | null;
  timezone: string | null; signed_in: boolean;
};

export type NewPerson = {
  role: 'client' | 'talent'; full_name: string; email: string;
  org_name?: string; headline?: string; location?: string; timezone?: string;
  years_exp?: number; english?: string; rate_month?: number; stage?: string;
};

/* ---------- demo store ---------- */
/* Next puts route handlers and server components in separate bundles, so a
   plain module-level object would give each of them its own copy. In demo
   mode the store hangs off globalThis so both sides see the same data. */
type Mem = {
  people: any[];                       // records the console added, awaiting first sign-in
  selves: Map<string, any>;            // each account's own editable profile
  searches: Map<string, RoleBrief>;    // one open role brief per client
  matches: MatchRow[]; interviews: Interview[];
  availability: Map<string, Availability>; calendars: Map<string, CalConn>; seeded: boolean;
};
export type CalConn = { user_id: string; refresh_token: string; email: string | null; connected_at: string; last_error?: string | null };
const g = globalThis as unknown as { __releve?: Mem };
const mem: Mem = g.__releve ?? (g.__releve = {
  people: [], selves: new Map(), searches: new Map(), matches: [], interviews: [], availability: new Map(), calendars: new Map(), seeded: false
});
function seed() {
  if (mem.seeded) return;
  mem.seeded = true;
  DEMO_BENCH.forEach(p => {
    const asia = p.tz.includes('+8');
    mem.availability.set(p.id, {
      user_id: p.id,
      timezone: asia ? 'Asia/Manila' : p.tz.includes('-5') ? 'America/Bogota'
        : p.tz.includes('-3') ? 'America/Argentina/Buenos_Aires' : 'America/Mexico_City',
      /* Asian talent working US hours run a night shift; Latin America overlaps in the day */
      windows: asia
        ? [...[1,2,3,4,5].map(weekday => ({ weekday, start_min: 21 * 60, end_min: 24 * 60 })),
           ...[2,3,4,5,6].map(weekday => ({ weekday, start_min: 0, end_min: 6 * 60 }))]
        : [1,2,3,4,5].map(weekday => ({ weekday, start_min: 8 * 60, end_min: 18 * 60 }))
    });
  });
  /* each account's own editable profile, prefilled from what Relève holds on file */
  DEMO_BENCH.forEach(p => mem.selves.set(p.id, {
    id: p.id, full_name: p.name, headline: p.role, location: p.loc,
    timezone: mem.availability.get(p.id)?.timezone, years_exp: p.yrs, english: p.eng,
    bio: '', skills: [], photo_url: '', onboarded_at: null, assigned_by_releve: true
  }));
  mem.selves.set('demo-client', {
    id: 'demo-client', full_name: 'Elena Marsh', headline: 'Founder & CEO', location: 'Los Angeles, USA',
    timezone: 'America/Los_Angeles', onboarded_at: null, assigned_by_releve: true
  });
  mem.availability.set('demo-client', {
    user_id: 'demo-client', timezone: 'America/Los_Angeles',
    windows: [1,2,3,4,5].map(weekday => ({ weekday, start_min: 7 * 60, end_min: 15 * 60 }))
  });
  mem.searches.set('demo-client', {
    client_key: 'demo-client', role_title: 'Chief of Staff',
    scope: 'Inbox and calendar, board prep, and running the weekly leadership meeting end to end.',
    hours: '40 a week, with four hours overlapping 8am–12pm Pacific',
    tools: 'Notion, Superhuman, Ramp, HubSpot',
    target_at: 'Within six weeks', stage: 'Interviewing'
  });
  mem.matches = DEMO_BENCH.filter(p => p.stage === 'Vetted').slice(0, 4).map((p, i) => ({
    id: 'm' + i, client_id: 'demo-client', talent_id: p.id,
    overall: null, manual: false, released: i < 3, client_state: null
  }));
}

/** Demo mode only: put everything back the way it was, so the walkthrough
    can be given twice in a row without leftovers from the last one. */
export function resetDemo() {
  if (configured()) return;
  mem.people = []; mem.matches = []; mem.interviews = [];
  mem.selves.clear(); mem.searches.clear(); mem.availability.clear(); mem.calendars.clear();
  mem.seeded = false;
  seed();
}

/* ---------- availability ---------- */
export async function getAvailability(userId: string, fallbackTz = 'UTC'): Promise<Availability> {
  if (!configured()) {
    seed();
    return mem.availability.get(userId) ?? { user_id: userId, timezone: fallbackTz, windows: DEFAULT_WINDOWS };
  }
  const sb = await supabaseServer();
  const { data } = await sb.from('availability').select('*').eq('user_id', userId).maybeSingle();
  return (data as Availability) ?? { user_id: userId, timezone: fallbackTz, windows: DEFAULT_WINDOWS };
}
/* Who can actually be booked, for a whole list of people, in one query.
   The bench page used to call getAvailability once per talent, which is a
   round trip each before the page can paint. */
export async function bookableIds(userIds: string[]): Promise<Set<string>> {
  const ok = new Set<string>();
  if (!userIds.length) return ok;
  if (!configured()) {
    seed();
    for (const id of userIds) {
      const a = mem.availability.get(id);
      if (a?.timezone && (a.windows?.length ?? 0) > 0) ok.add(id);
    }
    return ok;
  }
  const sb = await supabaseServer();
  const { data } = await sb.from('availability')
    .select('user_id, timezone, windows').in('user_id', userIds);
  for (const a of (data ?? []) as any[])
    if (a.timezone && (a.windows?.length ?? 0) > 0) ok.add(a.user_id);
  return ok;
}

export async function setAvailability(userId: string, timezone: string, windows: Window[]) {
  if (!configured()) { seed(); mem.availability.set(userId, { user_id: userId, timezone, windows }); return; }
  const sb = await supabaseServer();
  const { error } = await sb.from('availability')
    .upsert({ user_id: userId, timezone, windows }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

/* ---------- the role brief ---------- */
export async function getSearch(clientKey: string): Promise<RoleBrief | null> {
  if (!configured()) { seed(); return mem.searches.get(clientKey) ?? null; }
  const sb = await supabaseServer();
  const { data } = await sb.from('searches').select('*')
    .or(`client_id.eq.${clientKey},pending_id.eq.${clientKey}`).maybeSingle();
  return data ? { ...(data as any), client_key: clientKey } as RoleBrief : null;
}
export async function saveSearch(clientKey: string, patch: Partial<RoleBrief>, pending: boolean) {
  if (!configured()) {
    seed();
    mem.searches.set(clientKey, {
      ...(mem.searches.get(clientKey) ?? { client_key: clientKey, role_title: '' }),
      ...patch, updated_at: new Date().toISOString()
    } as RoleBrief);
    return;
  }
  const sb = await supabaseServer();
  const key: Record<string, string> = pending ? { pending_id: clientKey } : { client_id: clientKey };
  const { data } = await sb.from('searches').select('id')
    .or(`client_id.eq.${clientKey},pending_id.eq.${clientKey}`).maybeSingle();
  const row: Record<string, unknown> = { ...key, role_title: patch.role_title ?? '', scope: patch.scope ?? null,
    hours: patch.hours ?? null, tools: patch.tools ?? null,
    target_at: patch.target_at ?? null, stage: patch.stage ?? 'Sourcing' };
  /* A row claimed from a pending person still carries pending_id, and the
     one-owner constraint rejects a write that sets both. Clear it in the
     same statement, and read the error — this used to fail in silence and
     the brief simply never saved. */
  const { error } = data
    ? await sb.from('searches').update({ ...row, pending_id: null }).eq('id', (data as any).id)
    : await sb.from('searches').insert(row);
  if (error) throw new Error(error.message);
}

/* Everyone on the client side: real accounts first, then records waiting to be claimed. */
export async function listClients(): Promise<ClientRow[]> {
  if (!configured()) {
    seed();
    const demo: ClientRow = { key: 'demo-client', full_name: 'Elena Marsh', email: 'demo@relevestaffing.com',
      org_name: 'Marsh & Co.', timezone: 'America/Los_Angeles', signed_in: true };
    const added = mem.people.filter((p: any) => p.role === 'client').map((p: any) => ({
      key: p.id, full_name: p.full_name, email: p.email, org_name: p.org_name ?? null,
      timezone: p.timezone ?? null, signed_in: false
    }));
    return [demo, ...added];
  }
  const sb = await supabaseServer();
  const [{ data: profiles }, { data: pendingRows }] = await Promise.all([
    sb.from('profiles').select('id, full_name, email, org_name, timezone').eq('role', 'client'),
    sb.from('pending_people').select('*').eq('role', 'client').is('claimed_by', null)
  ]);
  return [
    ...((profiles ?? []) as any[]).map(p => ({ key: p.id, full_name: p.full_name, email: p.email,
      org_name: p.org_name, timezone: p.timezone, signed_in: true })),
    ...((pendingRows ?? []) as any[]).map(p => ({ key: p.id, full_name: p.full_name, email: p.email,
      org_name: p.org_name, timezone: p.timezone, signed_in: false }))
  ];
}

/* ---------- matches ---------- */
export async function listMatches(clientId: string): Promise<MatchRow[]> {
  if (!configured()) { seed(); return mem.matches.filter(m => m.client_id === clientId); }
  const sb = await supabaseServer();
  const { data } = await sb.from('matches').select('*').eq('client_id', clientId);
  return (data ?? []) as MatchRow[];
}
export async function setMatch(clientId: string, talentId: string, patch: Partial<MatchRow>) {
  if (!configured()) {
    seed();
    const found = mem.matches.find(m => m.client_id === clientId && m.talent_id === talentId);
    if (found) Object.assign(found, patch);
    else mem.matches.push({ id: 'm' + Date.now(), client_id: clientId, talent_id: talentId,
      overall: patch.overall ?? null, manual: true, released: false, client_state: null, ...patch });
    return;
  }
  const sb = await supabaseServer();
  /* The error was never read here, so a failed write reported success and the
     console said "Released to the client" while nothing had happened. */
  const { error } = await sb.from('matches')
    .upsert({ client_id: clientId, talent_id: talentId, ...patch },
            { onConflict: 'client_id,talent_id' });
  if (error) throw new Error(error.message);
}
export async function removeMatch(clientId: string, talentId: string) {
  if (!configured()) { seed(); mem.matches = mem.matches.filter(m => !(m.client_id === clientId && m.talent_id === talentId)); return; }
  const sb = await supabaseServer();
  const { error } = await sb.from('matches').delete()
    .eq('client_id', clientId).eq('talent_id', talentId);
  if (error) throw new Error(error.message);
}

/* ---------- interviews ---------- */
export async function listInterviews(filter?: { clientId?: string; talentId?: string }): Promise<Interview[]> {
  if (!configured()) {
    seed();
    return mem.interviews.filter(i =>
      (!filter?.clientId || i.client_id === filter.clientId) &&
      (!filter?.talentId || i.talent_id === filter.talentId)
    ).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  const sb = await supabaseServer();
  let q = sb.from('interview_list').select('*').order('starts_at');
  if (filter?.clientId) q = q.eq('client_id', filter.clientId);
  if (filter?.talentId) q = q.eq('talent_id', filter.talentId);
  const { data } = await q;
  return (data ?? []) as Interview[];
}
export async function createInterview(row: Omit<Interview, 'id' | 'created_at'>): Promise<Interview> {
  if (!configured()) {
    seed();
    const made = { ...row, id: 'iv' + Date.now(), created_at: new Date().toISOString() };
    mem.interviews.push(made); return made;
  }
  const sb = await supabaseServer();
  /* The error used to go unread and the id was faked with `?? 'x'`, so a
     failed booking returned HTTP 200 and both sides were emailed a
     confirmation for a meeting that did not exist. */
  const { data, error } = await sb.from('interviews').insert({
    client_id: row.client_id, talent_id: row.talent_id, stage: row.stage,
    starts_at: row.starts_at, duration_min: row.duration_min, status: row.status,
    meeting_url: row.meeting_url, meeting_id: row.meeting_id, notes: row.notes
  }).select().single();
  if (error || !data) throw new Error(error?.message ?? 'the interview could not be booked');
  return { ...row, id: (data as any).id, created_at: new Date().toISOString() };
}
export async function setInterviewStatus(id: string, status: InterviewStatus) {
  if (!configured()) { seed(); const i = mem.interviews.find(x => x.id === id); if (i) i.status = status; return; }
  const sb = await supabaseServer();
  const { error } = await sb.from('interviews').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function bookedSlots(userId: string): Promise<string[]> {
  const all = await listInterviews();
  return all.filter(i => (i.client_id === userId || i.talent_id === userId) &&
    ['Proposed', 'Confirmed'].includes(i.status)).map(i => i.starts_at);
}

/* ---------- people (console) ---------- */
export async function createPerson(p: NewPerson): Promise<{ id: string; invited: boolean }> {
  if (!configured()) {
    seed();
    const id = 'new-' + Date.now();
    mem.people.push({ id, ...p });
    return { id, invited: false };
  }
  const sb = await supabaseServer();
  /* an unclaimed record: the person is linked to it the first time they sign in with this email */
  const { data, error } = await sb.from('pending_people').insert({
    email: p.email.toLowerCase(), role: p.role, full_name: p.full_name, org_name: p.org_name ?? null,
    headline: p.headline ?? null, location: p.location ?? null, timezone: p.timezone ?? null,
    years_exp: p.years_exp ?? null, english: p.english ?? null, rate_month: p.rate_month ?? null,
    stage: p.stage ?? (p.role === 'talent' ? 'Applied' : 'Active')
  }).select().single();
  if (error) throw new Error(error.message);
  return { id: (data as any).id, invited: false };
}
export async function listPending() {
  if (!configured()) { seed(); return mem.people; }
  const sb = await supabaseServer();
  const { data } = await sb.from('pending_people').select('*').order('created_at', { ascending: false });
  return data ?? [];
}
export { DEMO_EXEC };


/* ---------- Google Calendar connections ---------- */
export async function getCalendar(userId: string): Promise<CalConn | null> {
  if (!configured()) { seed(); return mem.calendars.get(userId) ?? null; }
  const sb = await supabaseServer();
  const { data } = await sb.from('calendar_connections').select('*').eq('user_id', userId).maybeSingle();
  return (data as CalConn) ?? null;
}
export async function saveCalendar(userId: string, refresh_token: string, email: string | null) {
  if (!configured()) {
    seed();
    mem.calendars.set(userId, { user_id: userId, refresh_token, email, connected_at: new Date().toISOString() });
    return;
  }
  const sb = await supabaseServer();
  await sb.from('calendar_connections').upsert(
    { user_id: userId, refresh_token, email, connected_at: new Date().toISOString(), last_error: null },
    { onConflict: 'user_id' });
}
export async function forgetCalendar(userId: string) {
  if (!configured()) { seed(); mem.calendars.delete(userId); return; }
  const sb = await supabaseServer();
  await sb.from('calendar_connections').delete().eq('user_id', userId);
}
export async function noteCalendarError(userId: string, message: string) {
  if (!configured()) { seed(); const c = mem.calendars.get(userId); if (c) c.last_error = message; return; }
  const sb = await supabaseServer();
  await sb.from('calendar_connections').update({ last_error: message }).eq('user_id', userId);
}


/* ---------- a person's own profile ---------- */
export type SelfProfile = {
  full_name?: string; headline?: string; org_name?: string; location?: string; timezone?: string;
  years_exp?: number; english?: string; bio?: string; skills?: string[]; photo_url?: string;
  onboarded_at?: string | null; role_chosen_at?: string | null;
  assigned_by_releve?: boolean;
};
export async function getSelfProfile(userId: string): Promise<SelfProfile> {
  if (!configured()) { seed(); return (mem.selves.get(userId) ?? {}) as SelfProfile; }
  const sb = await supabaseServer();
  const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data ?? {}) as SelfProfile;
}
export async function saveSelfProfile(userId: string, patch: Record<string, unknown>) {
  if (!configured()) {
    seed();
    mem.selves.set(userId, { ...(mem.selves.get(userId) ?? { id: userId }), ...patch });
    return;
  }
  const sb = await supabaseServer();
  const { error } = await sb.from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}
export async function markOnboarded(userId: string) {
  await saveSelfProfile(userId, { onboarded_at: new Date().toISOString() });
}
