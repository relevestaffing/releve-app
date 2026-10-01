import { supabaseServer, configured } from '@/lib/supabase/server';

/* Both agreement flows are two-signer envelopes now (see lib/docusign.ts):
   the talent or client signs first, then Sage countersigns for Relève.
   These two small reads back the console's "waiting on you" queue —
   everyone who has signed their half and is sitting in 'submitted' with
   an envelope already sent, so Sage knows who still needs her. Once she
   countersigns, DocuSign's completed-envelope webhook moves the row to
   'verified' and it drops out of both lists on its own.

   Two plain queries joined in JS rather than a nested select, so this
   does not depend on guessing a foreign-key constraint's generated name. */

export type PendingCountersign = { id: string; name: string; envelopeId: string };

async function withNames(ids: string[], sb: any): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await sb.from('profiles').select('id, full_name, email').in('id', ids);
  return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.full_name ?? p.email ?? 'Someone']));
}

export async function pendingTalentCountersigns(): Promise<PendingCountersign[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('vetting')
    .select('talent_id, envelope_id')
    .eq('kind', 'agreement').eq('state', 'submitted').not('envelope_id', 'is', null);
  const rows = data ?? [];
  const names = await withNames(rows.map((r: any) => r.talent_id), sb);
  return rows.map((r: any) => ({ id: r.talent_id, envelopeId: r.envelope_id, name: names[r.talent_id] ?? 'Someone' }));
}

export async function pendingClientCountersigns(): Promise<PendingCountersign[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('client_agreements')
    .select('client_id, envelope_id')
    .eq('state', 'submitted').not('envelope_id', 'is', null);
  const rows = data ?? [];
  const names = await withNames(rows.map((r: any) => r.client_id), sb);
  return rows.map((r: any) => ({ id: r.client_id, envelopeId: r.envelope_id, name: names[r.client_id] ?? 'Someone' }));
}
