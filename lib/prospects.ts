import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer, configured } from './supabase/server';
import { upcomingCalendarEvents, calendarConfigured } from './calendar';
import { todayInPacific, addDaysISO } from './money-public';
import { isOpenStage, followUpDue } from './prospects-public';
import type { Prospect, ProspectStage, ProspectSource, Touch, TouchKind } from './prospects-public';

const OWN = /@relevestaffing\.com$/i;

/* A board that looks alive before anyone has wired Supabase. Six leads spread
   across the journey, a couple already due or overdue so the "Follow up today"
   card has something to show, owners drawn from the demo team. */
function demoProspects(): Prospect[] {
  const t = todayInPacific();
  const d = (n: number) => addDaysISO(t, n);
  const base = (over: Partial<Prospect>): Prospect => ({
    id: '', full_name: '', email: '', org_name: null, source: 'other',
    call_at: null, stage: 'new', note: null, lost_reason: null, pending_id: null,
    next_follow_up: null, last_touched_at: null, owner_id: null, website: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over
  });
  return [
    base({ id: 'demo-p1', full_name: 'Priya Nair', email: 'priya@lumenhealth.co', org_name: 'Lumen Health',
      source: 'instagram', stage: 'new', owner_id: 'demo-csm', next_follow_up: d(-3), last_touched_at: null }),
    base({ id: 'demo-p2', full_name: 'Marcus Feld', email: 'marcus@feldcapital.com', org_name: 'Feld Capital',
      source: 'linkedin', stage: 'contacted', owner_id: 'demo-admin', next_follow_up: t,
      last_touched_at: addDaysISO(t, -2) + 'T18:00:00Z' }),
    base({ id: 'demo-p3', full_name: 'Dana Osei', email: 'dana@brightpath.io', org_name: 'Brightpath',
      source: 'referral', stage: 'nurturing', owner_id: null, next_follow_up: d(4),
      last_touched_at: addDaysISO(t, -6) + 'T16:00:00Z' }),
    base({ id: 'demo-p4', full_name: 'Elena Marsh', email: 'elena@marshstudio.com', org_name: 'Marsh Studio',
      source: 'calendly', stage: 'booked', owner_id: 'demo-csm', call_at: d(1) + 'T17:00:00Z', next_follow_up: d(-1),
      last_touched_at: addDaysISO(t, -1) + 'T15:00:00Z' }),
    base({ id: 'demo-p5', full_name: 'Tobias Reyes', email: 'tobias@northwind.co', org_name: 'Northwind',
      source: 'website', stage: 'proposal', owner_id: 'demo-admin', next_follow_up: d(6),
      last_touched_at: addDaysISO(t, -3) + 'T19:00:00Z', note: 'Deciding between Essential and Specialist.' }),
    base({ id: 'demo-p6', full_name: 'Aisha Bello', email: 'aisha@bellogroup.com', org_name: 'Bello Group',
      source: 'event', stage: 'won', owner_id: 'demo-csm', last_touched_at: addDaysISO(t, -10) + 'T14:00:00Z' }),
    base({ id: 'demo-p7', full_name: 'Grant Whitley', email: 'grant@whitleyco.com', org_name: 'Whitley & Co',
      source: 'other', stage: 'lost', owner_id: null, lost_reason: 'Went with an in-house hire.',
      last_touched_at: addDaysISO(t, -20) + 'T14:00:00Z' })
  ];
}

/* Calendly writes "Discovery Call between Elena Marsh and Sage Jackson",
   or "30 Minute Meeting between Sage Jackson and Elena Marsh"; some tools
   write "Call with Elena Marsh". Take the side that is not Relève, and fall
   back to the address when the title gives nothing usable. */
function nameFromTitle(title: string, email: string): string {
  const notUs = (n: string) => n && n.length < 60 && !/sage|rel[eè]ve/i.test(n);
  const between = title.match(/between\s+(.+?)\s+(?:and|&)\s+(.+?)(?:\s*[:(\-]|$)/i);
  if (between) {
    const pick = [between[1], between[2]].map(s => s.trim()).find(notUs);
    if (pick) return pick;
  }
  const withm = title.match(/(?:with|for)\s+(.+?)(?:\s*[:(\-]|$)/i);
  if (withm && notUs(withm[1].trim())) return withm[1].trim();
  return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export async function listProspects(): Promise<Prospect[]> {
  if (!configured()) return demoProspects();
  const sb = await supabaseServer();
  /* Ordered by created_at in the query, which is valid before part51 runs,
     then sorted here so a missing next_follow_up column never takes the board
     down: open leads with a follow-up date come first, soonest due at the top
     (the heart of "who do I chase"), nulls last, and created order as the
     tiebreak. */
  const { data } = await sb.from('prospects').select('*')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as Prospect[];
  rows.sort((a, b) => {
    const af = isOpenStage(a.stage) ? a.next_follow_up : null;
    const bf = isOpenStage(b.stage) ? b.next_follow_up : null;
    if (af && bf) return af < bf ? -1 : af > bf ? 1 : 0;
    if (af) return -1;
    if (bf) return 1;
    return 0;
  });
  return rows;
}

/* The open leads owed a touch today, most overdue first. An open lead
   (never won or lost) whose next follow-up is today or earlier is due. The
   "Follow up today" card on the Overview and the daily digest both read
   this. Tolerant: before part51 adds next_follow_up the column is missing,
   so a failed query returns [] rather than taking the page or the cron down,
   and in preview it returns the demo leads that are due. */
export async function dueFollowUps(): Promise<Prospect[]> {
  const today = todayInPacific();
  const soonest = (a: Prospect, b: Prospect) =>
    a.next_follow_up! < b.next_follow_up! ? -1 : a.next_follow_up! > b.next_follow_up! ? 1 : 0;
  if (!configured())
    return demoProspects().filter(p => followUpDue(p, today)).sort(soonest);
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.from('prospects').select('*')
      .not('stage', 'in', '("won","lost")')
      .not('next_follow_up', 'is', null)
      .lte('next_follow_up', today)
      .order('next_follow_up', { ascending: true });
    if (error) return [];
    return ((data ?? []) as Prospect[]).filter(p => followUpDue(p, today)).sort(soonest);
  } catch { return []; }
}

export async function saveProspect(row: {
  id?: string; full_name: string; email: string; org_name?: string | null;
  source?: ProspectSource; call_at?: string | null; note?: string | null;
  website?: string | null;
}): Promise<string> {
  const sb = await supabaseServer();
  const email = row.email.trim().toLowerCase();
  const patch: any = {
    full_name: row.full_name.trim(), email, org_name: row.org_name?.trim() || null,
    call_at: row.call_at || null, note: row.note?.trim() || null
  };
  if (row.source) patch.source = row.source;
  if (row.website !== undefined) patch.website = row.website?.trim() || null;
  if (row.id) {
    let { error } = await sb.from('prospects').update(patch).eq('id', row.id);
    if (error && /website/i.test(error.message) && 'website' in patch) {
      delete patch.website;
      ({ error } = await sb.from('prospects').update(patch).eq('id', row.id));
    }
    if (error) throw new Error(error.message);
    return row.id;
  }
  let ins = await sb.from('prospects').insert(patch).select('id').single();
  if (ins.error && /website/i.test(ins.error.message) && 'website' in patch) {
    delete patch.website;
    ins = await sb.from('prospects').insert(patch).select('id').single();
  }
  if (ins.error) {
    if (ins.error.code === '23505') throw new Error('They are already on the list.');
    throw new Error(ins.error.message);
  }
  return (ins.data as any).id;
}

/* One lead in full, for its account page. Tolerant of the website column being
   absent before part52: select('*') simply omits it. */
export async function getProspect(id: string): Promise<Prospect | null> {
  if (!configured()) return demoProspects().find(p => p.id === id) ?? null;
  const sb = await supabaseServer();
  const { data } = await sb.from('prospects').select('*').eq('id', id).maybeSingle();
  return (data as Prospect) ?? null;
}

export async function setProspectStage(id: string, stage: ProspectStage, extra?: { lost_reason?: string | null; note?: string | null }) {
  const sb = await supabaseServer();
  const patch: any = { stage };
  if (extra?.lost_reason !== undefined) patch.lost_reason = extra.lost_reason?.trim() || null;
  if (extra?.note !== undefined) patch.note = extra.note?.trim() || null;
  const { error } = await sb.from('prospects').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/* Who owns the lead, and when to chase it. Both write a single new column, so
   each is wrapped: before part51 runs the column is missing and the write
   fails cleanly with a message the toast can show, rather than a 500. */
export async function setProspectOwner(id: string, ownerId: string | null) {
  const sb = await supabaseServer();
  const { error } = await sb.from('prospects').update({ owner_id: ownerId || null }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setProspectFollowUp(id: string, date: string | null) {
  const sb = await supabaseServer();
  const { error } = await sb.from('prospects').update({ next_follow_up: date || null }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* Log a touch. The database trigger moves the lead's clock forward: last
   touched now, and the next follow-up to whatever was set here. */
export async function logTouch(t: {
  prospect_id: string; kind: TouchKind; note?: string | null; next_follow_up?: string | null; by?: string | null;
}) {
  const sb = await supabaseServer();
  const row: any = { prospect_id: t.prospect_id, kind: t.kind, note: t.note?.trim() || null };
  if (t.next_follow_up) row.next_follow_up = t.next_follow_up;
  if (t.by) row.by = t.by;
  const { error } = await sb.from('prospect_touches').insert(row);
  if (error) throw new Error(error.message);
}

export async function listTouches(prospectId: string): Promise<Touch[]> {
  if (!configured()) {
    const t = todayInPacific();
    return [
      { id: 'demo-t1', prospect_id: prospectId, at: addDaysISO(t, -2) + 'T18:00:00Z', by: 'demo-admin',
        kind: 'call', note: 'Good first call. Walked through the Signature and the Part-Time plan.', next_follow_up: t },
      { id: 'demo-t2', prospect_id: prospectId, at: addDaysISO(t, -6) + 'T16:00:00Z', by: 'demo-csm',
        kind: 'email', note: 'Sent the one-pager and a Calendly link.', next_follow_up: null }
    ];
  }
  try {
    const sb = await supabaseServer();
    const { data } = await sb.from('prospect_touches').select('*')
      .eq('prospect_id', prospectId).order('at', { ascending: false });
    return (data ?? []) as Touch[];
  } catch { return []; }
}

/* The onboarding email is what turns a prospect into an executive. Called
   from the onboarding route with the pending_people row it just made, so
   the prospect is marked won and points at the account it became. Matching
   is by email, because that is the one thing both records share. */
export async function markProspectWon(email: string, pendingId: string | null) {
  if (!configured()) return;
  try {
    const sb = await supabaseServer();
    await sb.from('prospects')
      .update({ stage: 'won', pending_id: pendingId })
      .eq('email', email.trim().toLowerCase()).not('stage', 'in', '("won","lost")');
  } catch { /* never worth failing the send over */ }
}

/* Pull discovery calls off hello@'s calendar. Any upcoming event with at
   least one attendee outside Relève becomes a prospect, once, keyed on the
   calendar event id. Names come from the event title when Calendly wrote
   one ("Discovery Call: Elena Marsh and Sage Jackson"), otherwise from the
   address, and Sage tidies them on the page. */
export async function importProspectsFromCalendar(
  client?: SupabaseClient
): Promise<{ added: number; skipped: number; reason?: string }> {
  if (!configured()) return { added: 0, skipped: 0, reason: 'preview' };
  if (!calendarConfigured()) return { added: 0, skipped: 0, reason: 'The calendar is not connected.' };
  const events = await upcomingCalendarEvents(45);
  /* The signed-in session normally, but the daily cron has no session, so it
     passes the service-role client: the calendar is read over its own
     service-account JWT either way, and the writes then run under the role
     that is allowed to make them rather than failing silently under RLS. */
  const sb = client ?? await supabaseServer();

  /* Who is already known, so a kick-off with a client, a screening call
     with an applicant or a review with placed talent never becomes a
     prospect. One read each, not one per event. */
  const known = new Set<string>();
  const [{ data: prof }, { data: pend }, { data: apps }, { data: pros }] = await Promise.all([
    sb.from('profiles').select('email'),
    sb.from('pending_people').select('email'),
    sb.from('job_applications').select('email'),
    sb.from('prospects').select('email')
  ]);
  for (const rows of [prof, pend, apps, pros])
    for (const r of (rows ?? []) as any[]) if (r.email) known.add(String(r.email).toLowerCase());

  let added = 0, skipped = 0;
  for (const e of events) {
    const outside = e.attendees.filter(a => !OWN.test(a)).map(a => a.toLowerCase());
    if (!outside.length || e.allDay) { skipped++; continue; }
    const email = outside.find(a => !known.has(a));
    if (!email) { skipped++; continue; }
    const full_name = nameFromTitle(e.title, email);
    const { error } = await sb.from('prospects').insert({
      full_name, email, source: 'calendly', call_at: e.start,
      calendar_event_id: e.id, stage: 'booked'
    });
    if (error) { skipped++; continue; }   // this event was imported before
    known.add(email);
    added++;
  }
  return { added, skipped };
}
