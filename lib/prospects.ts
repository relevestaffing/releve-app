import { supabaseServer, configured } from './supabase/server';
import { upcomingCalendarEvents, calendarConfigured } from './calendar';
import type { Prospect, ProspectStage, ProspectSource } from './prospects-public';

const OWN = /@relevestaffing\.com$/i;

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
      .ilike('email', email.trim()).not('stage', 'in', '("won","lost")');
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
  let added = 0, skipped = 0;
  for (const e of events) {
    const outside = e.attendees.filter(a => !OWN.test(a));
    if (!outside.length || e.allDay) { skipped++; continue; }
    const email = outside[0].toLowerCase();
    const m = e.title.match(/(?:call|meeting|intro(?:duction)?)[:\s-]+(.+?)\s+(?:and|&|with|x)\s+/i);
    const guess = m?.[1]?.trim();
    const full_name = guess && guess.length < 60 ? guess : email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const { error } = await sb.from('prospects').insert({
      full_name, email, source: 'calendly', call_at: e.start,
      calendar_event_id: e.id, stage: 'booked'
    });
    if (error) { skipped++; continue; }   // already imported, or already a prospect
    added++;
  }
  return { added, skipped };
}
