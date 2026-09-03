/* The offer — the step between an interview and a placement, and the moment
   Relève actually earns money.

   The two rates live on one row and must never meet: the executive reads
   my_offer_client, the talent reads my_offer_talent, and only the team reads
   the table itself. Accepting goes through answer_offer() in the database so
   neither side can reach the other's number and so "both said yes" is decided
   in exactly one place. */
import { configured, supabaseServer } from './supabase/server';
import type { Offer } from './offer-public';

export * from './offer-public';

export async function allOffers(): Promise<Offer[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('offers')
    .select('*, client:client_id(full_name, org_name), talent:talent_id(full_name, headline)')
    .order('created_at', { ascending: false }).limit(100);
  return (data ?? []).map((r: any) => ({
    ...r,
    client_name: r.client?.full_name ?? 'Executive',
    org_name: r.client?.org_name ?? null,
    talent_name: r.talent?.full_name ?? 'Talent',
    talent_role: r.talent?.headline ?? null
  })) as Offer[];
}

export async function makeOffer(o: {
  client_id: string; talent_id: string; role_title: string; starts_on: string;
  hours?: string; scope?: string;
  rate_month_cents?: number; talent_pay_cents?: number; minimum_months?: number;
  send?: boolean;
}) {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data, error } = await sb.from('offers').insert({
    client_id: o.client_id, talent_id: o.talent_id,
    role_title: o.role_title.trim(), starts_on: o.starts_on,
    hours: o.hours?.trim() || null, scope: o.scope?.trim() || null,
    rate_month_cents: o.rate_month_cents ?? null,
    talent_pay_cents: o.talent_pay_cents ?? null,
    minimum_months: o.minimum_months ?? 3,
    state: o.send ? 'sent' : 'draft',
    sent_on: o.send ? new Date().toISOString().slice(0, 10) : null
  }).select().single();
  if (error) throw new Error(error.message);
  return data as Offer;
}

export async function sendOffer(id: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('offers')
    .update({ state: 'sent', sent_on: new Date().toISOString().slice(0, 10) })
    .eq('id', id).eq('state', 'draft');
  if (error) throw new Error(error.message);
}

export async function withdrawOffer(id: string, reason?: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('offers').update({
    state: 'withdrawn', declined_by: 'releve',
    decline_reason: reason?.trim() || null,
    decided_on: new Date().toISOString().slice(0, 10)
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* Whichever side is signed in, answering their own offer. */
export async function answerOffer(id: string, answer: 'yes' | 'no'): Promise<string> {
  if (!configured()) return 'waiting';
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('answer_offer', { offer: id, answer });
  if (error) throw new Error(error.message);
  return String(data ?? 'waiting');
}

/* Accepted offer in, placement out — with the terms already agreed rather
   than typed a second time. */
export async function placeFromOffer(id: string): Promise<string> {
  if (!configured()) return '';
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('place_from_offer', { offer: id });
  if (error) throw new Error(error.message);
  return String(data ?? '');
}

/* The one open offer for whoever is signed in, read through the view that
   hides the other side's number. */
export async function myOffer(userId: string, side: 'client' | 'talent') {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const view = side === 'client' ? 'my_offer_client' : 'my_offer_talent';
  const { data } = await sb.from(view).select('*')
    .order('sent_on', { ascending: false }).limit(1).maybeSingle();
  return (data ?? null) as any;
}
