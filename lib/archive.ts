/* Getting somebody out of the way, without destroying them.
   ---------------------------------------------------------
   Until now the console had one way to clear a row: delete the account,
   which cascades their Signature, interviews, matches, placements, invoices
   and payment history, and cannot be undone. Right for a test row typed in
   while building the thing. Wrong for a real client who finished an
   engagement, because Relève's own commercial terms lean on exactly those
   records: invoices are the evidence behind money collected, and a
   12-month non-circumvention clause means nothing against a placement
   history that no longer exists.

   So there are two actions now, and the difference between them is the
   whole point:

     ARCHIVE  — one timestamp. They leave every list, count and alert, and
                every record they are attached to stays. Reversible.
     REMOVE   — the old delete. Permanent, and guarded.

   Archive is the everyday one. Remove is for rows with nothing worth
   keeping. */

import { supabaseServer, configured, currentProfile } from '@/lib/supabase/server';

export type Blocked = { id: string; blocker: string };

/* Is PART 40 actually applied to this database?
   -----------------------------------------------
   The schema change and the deploy are two separate acts by two separate
   hands, and they will not land in the same minute. If the app shipped first
   and simply asked for profiles.archived_at, PostgREST would answer "column
   does not exist" and the Directory and the console Overview — the two pages
   this app is least able to do without — would go blank until the SQL ran.

   So it is asked and remembered. Yes is remembered for good — a column does
   not go away. No is remembered for a minute and then asked again, because
   the whole point of the minute after running the SQL is that somebody is
   standing there reloading the page, and a "not switched on yet" notice that
   outlives the thing being switched on is its own small bug.

   Delete this, and the call sites that consult it, once PART 40 has been
   live for a while. */
let archiveReady: boolean | null = null;
let askedAt = 0;
const RETRY_MS = 60_000;

export async function archivingIsLive(): Promise<boolean> {
  if (archiveReady === true) return true;
  if (archiveReady === false && Date.now() - askedAt < RETRY_MS) return false;
  if (!configured()) { archiveReady = false; askedAt = Date.now(); return false; }
  try {
    const sb = await supabaseServer();
    const { error } = await sb.from('profiles')
      .select('archived_at', { head: true, count: 'exact' }).limit(1);
    archiveReady = !error;
  } catch { archiveReady = false; }
  askedAt = Date.now();
  return archiveReady;
}

/* What stands in the way of permanently removing somebody.
   --------------------------------------------------------
   Three things, each of which makes a delete destroy something nobody meant
   to destroy: a live placement, an unpaid invoice, and money still owed to
   them. That last one was missing until the cleanup screen made it plain
   that removing a talent mid-payroll erases the debt and the person it was
   owed to in the same call, and nothing in the app would ever mention it
   again.

   Written once, here, and called by both the cleanup screen (which shows the
   reason) and deleteAccount (which refuses for the reason). One function, so
   the sentence on screen and the sentence thrown are the same sentence and
   cannot drift apart.

   Reads every table once and groups in memory rather than asking per person,
   because the cleanup screen asks about everybody at once. Callers are
   already behind the admin guard; row level security would refuse these
   reads to anyone else regardless. */
export async function removalBlockers(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!ids.length || !configured()) return out;
  const sb = await supabaseServer();

  const [places, invs, pays] = await Promise.all([
    sb.from('placements').select('client_id, talent_id').is('ended_on', null),
    sb.from('invoices').select('client_id').in('status', ['draft', 'sent', 'failed']),
    sb.from('talent_payments').select('talent_id').neq('state', 'sent')
  ]);

  const live = new Set<string>();
  for (const r of (places.data ?? []) as any[]) {
    if (r.client_id) live.add(r.client_id);
    if (r.talent_id) live.add(r.talent_id);
  }
  const owing = new Set(((invs.data ?? []) as any[]).map(r => r.client_id).filter(Boolean));
  const owed = new Set(((pays.data ?? []) as any[]).map(r => r.talent_id).filter(Boolean));

  for (const id of ids) {
    if (live.has(id)) out[id] = 'Has a live placement. End it first.';
    else if (owing.has(id)) out[id] = 'Has an unpaid invoice. Settle or void it first.';
    else if (owed.has(id)) out[id] = 'Is still owed money. Pay or clear it first.';
  }
  return out;
}

/** Hide somebody from the console without touching anything they did. */
export async function archivePerson(id: string, reason?: string | null) {
  if (!configured()) return;
  if (!(await archivingIsLive()))
    throw new Error('Archiving is not switched on for this database yet. Run part40-archive.sql in Supabase, then try again.');
  const me = await currentProfile();
  const sb = await supabaseServer();
  const { error } = await sb.from('profiles').update({
    archived_at: new Date().toISOString(),
    archived_by: me?.id ?? null,
    archive_reason: (reason ?? '').trim().slice(0, 200) || null
  }).eq('id', id);
  if (error) throw error;
}

/** Put them back. The whole reason archiving is the default. */
export async function restorePerson(id: string) {
  if (!configured() || !(await archivingIsLive())) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('profiles').update({
    archived_at: null, archived_by: null, archive_reason: null
  }).eq('id', id);
  if (error) throw error;
}

/* The cleanup screen's whole dataset, in one pass.
   ------------------------------------------------
   The screen exists to answer one question per row: is this a real person
   with history behind them, or a row typed in while testing? So every row
   carries what it actually has on file — a Signature, placements, invoices,
   payments — rather than a name and a delete button and a guess.

   Every table is read once and aggregated here rather than queried per
   person, which is the same shape the console overview already uses. */
export type CleanupRow = {
  id: string;
  name: string | null;
  email: string | null;
  org: string | null;
  role: 'client' | 'talent';
  /* A row in pending_people: invited, never signed in, so nothing exists
     for it beyond the invitation. Removing one forgets an invitation. */
  pending: boolean;
  signature: boolean;
  placements: number;
  invoices: number;
  payments: number;
  blocker: string | null;
};

export async function cleanupRows(): Promise<CleanupRow[]> {
  if (!configured()) return [];
  const archiving = await archivingIsLive();
  const sb = await supabaseServer();
  const peopleQ = sb.from('profiles').select('id, full_name, email, org_name, role')
    .in('role', ['client', 'talent']);

  const [people, pending, sigs, places, invs, pays] = await Promise.all([
    /* Team accounts are deliberately absent: removing a colleague is the
       Team page's job, and a screen built for clearing out test rows is the
       last place anyone should be able to delete an admin by mis-ticking. */
    archiving ? peopleQ.is('archived_at', null) : peopleQ,
    sb.from('pending_people').select('id, full_name, email, org_name, role').is('claimed_by', null),
    sb.from('signatures').select('user_id'),
    sb.from('placements').select('client_id, talent_id'),
    sb.from('invoices').select('client_id'),
    sb.from('talent_payments').select('talent_id')
  ]);

  const count = (rows: any[] | null, key: string) => {
    const m: Record<string, number> = {};
    for (const r of rows ?? []) {
      const v = r?.[key];
      if (v) m[v] = (m[v] ?? 0) + 1;
    }
    return m;
  };
  const hasSig = new Set(((sigs.data ?? []) as any[]).map(s => s.user_id));
  const asClient = count(places.data as any[], 'client_id');
  const asTalent = count(places.data as any[], 'talent_id');
  const invoiceBy = count(invs.data as any[], 'client_id');
  const paymentBy = count(pays.data as any[], 'talent_id');

  const live: CleanupRow[] = ((people.data ?? []) as any[]).map(p => ({
    id: p.id, name: p.full_name, email: p.email, org: p.org_name,
    role: p.role as 'client' | 'talent', pending: false,
    signature: hasSig.has(p.id),
    placements: (asClient[p.id] ?? 0) + (asTalent[p.id] ?? 0),
    invoices: invoiceBy[p.id] ?? 0,
    payments: paymentBy[p.id] ?? 0,
    blocker: null
  }));

  /* An unclaimed invitation has no account behind it, so nothing can block
     removing one and there is nothing to archive — it is forgotten, or it
     stays. */
  const invited: CleanupRow[] = ((pending.data ?? []) as any[])
    .filter(p => p.role === 'client' || p.role === 'talent')
    .map(p => ({
      id: p.id, name: p.full_name, email: p.email, org: p.org_name,
      role: p.role as 'client' | 'talent', pending: true,
      signature: false, placements: 0, invoices: 0, payments: 0, blocker: null
    }));

  const blockers = await removalBlockers(live.map(r => r.id));
  for (const r of live) r.blocker = blockers[r.id] ?? null;

  return [...live, ...invited].sort((a, b) =>
    (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? ''));
}

export type ArchivedRow = {
  id: string; full_name: string | null; email: string | null; role: string | null;
  org_name: string | null; archived_at: string; archive_reason: string | null;
};

/** Everyone currently archived, newest first. Only ever read on the cleanup
    screen, so nothing else has to know archiving exists. */
export async function listArchived(): Promise<ArchivedRow[]> {
  if (!configured() || !(await archivingIsLive())) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('profiles')
    .select('id, full_name, email, role, org_name, archived_at, archive_reason')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });
  return (data ?? []) as ArchivedRow[];
}
