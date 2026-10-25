import { supabaseServer, configured } from './supabase/server';
import { upcomingCalendarEvents, calendarConfigured } from './calendar';
import type { Prospect, ProspectStage, ProspectSource } from './prospects-public';

const OWN = /@relevestaffing\.com$/i;

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
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('prospects').select('*')
    .order('call_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as Prospect[];
}

export async function saveProspect(row: {
  id?: string; full_name: string; email: string; org_name?: string | null;
  source?: ProspectSource; call_at?: string | null; note?: string | null;
}): Promise<string> {
  const sb = await supabaseServer();
  const email = row.email.trim().toLowerCase();
  const patch: any = {
    full_name: row.full_name.trim(), email, org_name: row.org_name?.trim() || null,
    call_at: row.call_at || null, note: row.note?.trim() || null
  };
  if (row.source) patch.source = row.source;
  if (row.id) {
    const { error } = await sb.from('prospects').update(patch).eq('id', row.id);
    if (error) throw new Error(error.message);
    return row.id;
  }
  const { data, error } = await sb.from('prospects').insert(patch).select('id').single();
  if (error) {
    if (error.code === '23505') throw new Error('They are already on the list.');
    throw new Error(error.message);
  }
  return (data as any).id;
}

export async function setProspectStage(id: string, stage: ProspectStage, extra?: { lost_reason?: string | null; note?: string | null }) {
  const sb = await supabaseServer();
  const patch: any = { stage };
  if (extra?.lost_reason !== undefined) patch.lost_reason = extra.lost_reason?.trim() || null;
  if (extra?.note !== undefined) patch.note = extra.note?.trim() || null;
  const { error } = await sb.from('prospects').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
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
export async function importProspectsFromCalendar(): Promise<{ added: number; skipped: number; reason?: string }> {
  if (!configured()) return { added: 0, skipped: 0, reason: 'preview' };
  if (!calendarConfigured()) return { added: 0, skipped: 0, reason: 'The calendar is not connected.' };
  const events = await upcomingCalendarEvents(45);
  const sb = await supabaseServer();

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
