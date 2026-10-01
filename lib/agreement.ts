import { supabaseServer, configured } from '@/lib/supabase/server';

export type ClientAgreement = {
  state: 'not_started' | 'submitted' | 'verified' | 'rejected';
  envelope_id: string | null;
  file_path: string | null;
  reject_reason: string | null;
};

/* The client's own Client Services Agreement row — mirrors what
   listVetting does for talent's agreement kind. Used on the dashboard to
   decide whether the "Sign your agreement" card still needs to show. */
export async function getClientAgreement(clientId: string): Promise<ClientAgreement | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('client_agreements')
    .select('state, envelope_id, file_path, reject_reason')
    .eq('client_id', clientId).maybeSingle();
  return (data as any) ?? null;
}

/* Batch version for the Executives console list — one query for every
   client row on the page rather than one per row. Anyone with no row yet
   reads as 'not_started', same default the column itself uses. */
export async function getClientAgreements(clientIds: string[]): Promise<Record<string, ClientAgreement>> {
  if (!configured() || !clientIds.length) return {};
  const sb = await supabaseServer();
  const { data } = await sb.from('client_agreements')
    .select('client_id, state, envelope_id, file_path, reject_reason')
    .in('client_id', clientIds);
  return Object.fromEntries((data ?? []).map((r: any) => [r.client_id, r as ClientAgreement]));
}
