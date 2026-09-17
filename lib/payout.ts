import { configured, supabaseServer } from '@/lib/supabase/server';
import type { Payout, TalentPayment } from '@/lib/payout-public';
export * from '@/lib/payout-public';

/* ---------- how somebody gets paid ---------- */

export async function getPayout(talentId: string): Promise<Payout | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('talent_payout').select('*').eq('talent_id', talentId).maybeSingle();
  return (data as Payout) ?? null;
}

export async function savePayout(talentId: string, row: Partial<Payout>) {
  const sb = await supabaseServer();
  const { error } = await sb.from('talent_payout')
    .upsert({ talent_id: talentId, ...row }, { onConflict: 'talent_id' });
  if (error) throw new Error(error.message);
}

/** Relève confirming it has checked these against the person's identity. */
export async function confirmPayout(talentId: string) {
  const sb = await supabaseServer();
  const { error } = await sb.from('talent_payout')
    .update({ confirmed_at: new Date().toISOString() }).eq('talent_id', talentId);
  if (error) throw new Error(error.message);
}

/* Relève records that the signed W-8BEN is actually held. Deliberately not
   reachable from the person's own save: paperwork somebody can mark complete
   about themselves is not paperwork. */
export async function setTaxForm(talentId: string, held: boolean) {
  const sb = await supabaseServer();
  const { error } = await sb.from('talent_payout').update({
    tax_form_on_file: held,
    tax_form_signed_on: held ? new Date().toISOString().slice(0, 10) : null
  }).eq('talent_id', talentId);
  if (error) throw new Error(error.message);
}

/* ---------- what Relève pays them ---------- */

/** Set, or change, what Relève pays a person each month. Cents in; the
    database keeps the deprecated dollar column in step by trigger. */
export async function setTalentPay(talentId: string, cents: number) {
  const sb = await supabaseServer();
  const { error } = await sb.from('talent_pay')
    .upsert({ talent_id: talentId, rate_month_cents: cents, rate_month: Math.round(cents / 100),
              updated_at: new Date().toISOString() }, { onConflict: 'talent_id' });
  if (error) throw new Error(error.message);
}

/** Live placements whose talent has no pay on file — the people the
    monthly payroll run will skip without a word. */
export async function unpaidPlacements(): Promise<{ placement_id: string; talent_id: string; talent_name: string }[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  /* Pay is per placement now (a talent can hold two, one per executive), with
     the talent's roster rate as the fallback. A live placement is "unpaid" only
     when it has neither. */
  const [{ data: live }, { data: pay }, { data: terms }] = await Promise.all([
    sb.from('placements').select('id, talent_id, talent:talent_id(full_name)').is('ended_on', null),
    sb.from('talent_pay').select('talent_id, rate_month_cents'),
    sb.from('placement_terms').select('placement_id, talent_pay_cents')
  ]);
  const rosterHas = new Set(((pay ?? []) as any[]).filter(p => p.rate_month_cents != null).map(p => p.talent_id));
  const perPlacement = new Map(((terms ?? []) as any[]).map(t => [t.placement_id, t.talent_pay_cents]));
  return ((live ?? []) as any[])
    .filter(p => perPlacement.get(p.id) == null && !rosterHas.has(p.talent_id))
    .map(p => ({ placement_id: p.id, talent_id: p.talent_id, talent_name: p.talent?.full_name ?? 'Talent' }));
}

/* ---------- money out ---------- */

export async function listPayments(talentId?: string): Promise<TalentPayment[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  let q = sb.from('talent_payments')
    .select('*, talent:talent_id(full_name)')
    .order('period_start', { ascending: false });
  if (talentId) q = q.eq('talent_id', talentId);
  const { data } = await q;
  return ((data ?? []) as any[]).map(r => ({ ...r, talent_name: r.talent?.full_name })) as TalentPayment[];
}

export async function setPaymentState(id: string, patch: {
  state: 'due' | 'sent' | 'failed'; method?: string | null; reference?: string | null; note?: string | null;
}) {
  const sb = await supabaseServer();
  const { error } = await sb.from('talent_payments').update({
    ...patch,
    sent_on: patch.state === 'sent' ? new Date().toISOString().slice(0, 10) : null
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** The month's payroll, mirroring the retainer run. Idempotent. */
export async function payTheMonth(month?: string): Promise<number> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('pay_the_month',
    { for_month: month ?? new Date().toISOString().slice(0, 10) });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

/* ---------- what Relève actually earns ---------- */

export type Margin = {
  placement_id: string; client_id: string; talent_id: string;
  started_on: string; ended_on: string | null;
  client_pays_cents: number | null; talent_paid_cents: number | null; margin_cents: number | null;
};

export async function margins(): Promise<Margin[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('placement_margin').select('*').is('ended_on', null);
  return (data ?? []) as Margin[];
}

/** The three numbers that say whether the business works. */
export async function marginSummary() {
  const rows = await margins();
  /* Only placements with both numbers count — the page says so, and the
     totals used to disagree with it by summing every row's known half. */
  const known = rows.filter(r => r.client_pays_cents != null && r.talent_paid_cents != null);
  const gross = known.reduce((n, r) => n + (r.client_pays_cents ?? 0), 0);
  const cost  = known.reduce((n, r) => n + (r.talent_paid_cents ?? 0), 0);
  return {
    grossCents: gross,
    costCents: cost,
    netCents: gross - cost,
    pct: gross > 0 ? Math.round(((gross - cost) / gross) * 100) : null,
    /* A placement missing either number is not counted, and saying so matters
       more than the figure — a margin quietly computed over half the roster
       is worse than no margin at all. */
    counted: known.length,
    total: rows.length
  };
}
