import { configured, supabaseServer } from '@/lib/supabase/server';
import type { Payout, TalentPayment } from '@/lib/payout-public';
import { todayInPacific } from '@/lib/money-public';
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
    tax_form_signed_on: held ? todayInPacific() : null
  }).eq('talent_id', talentId);
  if (error) throw new Error(error.message);
}

/* ---------- what Relève pays them ---------- */

/** Set, or change, what Relève pays a person each month. Cents in; the
    database keeps the deprecated dollar column in step by trigger.

    Since PART 31, a live placement's pay is read from
    placement_terms.talent_pay_cents, not this roster-wide row — payroll has
    preferred the per-placement number since then. Writing only here used to
    look saved and change nothing for anyone already placed (admin-console
    audit, P0). This now finds that talent's active placement(s) first:
    - none: they aren't placed yet, so the roster default is the only number
      that exists — write it here, same as before.
    - exactly one: that placement is what payroll will actually pay, so the
      write goes there instead, and the roster row is left as the pre-
      placement default for next time.
    - more than one (a talent can serve two executives at once, PART 31):
      a single editor can't safely guess which placement's pay is meant, so
      this refuses rather than silently updating the wrong one. */
export async function setTalentPay(talentId: string, cents: number) {
  const sb = await supabaseServer();
  const { data: live } = await sb.from('placements')
    .select('id').eq('talent_id', talentId).is('ended_on', null);
  const activeIds = ((live ?? []) as any[]).map(p => p.id);
  if (activeIds.length > 1) {
    throw new Error('This person works two placements at once. Set the pay for each one on its placement file, under Placements.');
  }
  if (activeIds.length === 1) {
    const { error } = await sb.from('placement_terms')
      .update({ talent_pay_cents: cents, updated_at: new Date().toISOString() })
      .eq('placement_id', activeIds[0]);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await sb.from('talent_pay')
    .upsert({ talent_id: talentId, rate_month_cents: cents, rate_month: Math.round(cents / 100),
              updated_at: new Date().toISOString() }, { onConflict: 'talent_id' });
  if (error) throw new Error(error.message);
}

/** What Relève pays the talent on one placement. The per-placement number
    payroll actually reads; the roster rate is only the fallback. */
export async function setPlacementPay(placementId: string, cents: number | null) {
  const sb = await supabaseServer();
  const { data, error } = await sb.from('placement_terms')
    .update({ talent_pay_cents: cents, updated_at: new Date().toISOString() })
    .eq('placement_id', placementId).select('placement_id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const { error: e2 } = await sb.from('placement_terms')
      .insert({ placement_id: placementId, talent_pay_cents: cents });
    if (e2) throw new Error(e2.message);
  }
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
    .select('*, talent:talent_id(full_name), placement:placement_id(suspended_at, client:client_id(full_name, org_name))')
    .order('period_start', { ascending: false });
  if (talentId) q = q.eq('talent_id', talentId);
  const { data } = await q;
  return ((data ?? []) as any[]).map(r => ({
    ...r, talent_name: r.talent?.full_name,
    client_name: r.placement?.client?.org_name ?? r.placement?.client?.full_name ?? null,
    paused: Boolean(r.placement?.suspended_at)
  })) as TalentPayment[];
}

/* Recorded in US dollars: what was owed is amount_cents; what actually left
   (if different), any fee Relève paid on top, and a free-text note of what
   landed in the local currency. Never a second currency amount. */
export async function setPaymentState(id: string, patch: {
  state: 'due' | 'sent' | 'failed'; method?: string | null; reference?: string | null; note?: string | null;
  sent_cents?: number | null; fee_cents?: number | null; fx_note?: string | null;
}) {
  const sb = await supabaseServer();
  const row: Record<string, unknown> = {
    state: patch.state, method: patch.method ?? null, reference: patch.reference ?? null,
    currency: 'USD',
    sent_on: patch.state === 'sent' ? todayInPacific() : null
  };
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.sent_cents !== undefined) row.sent_cents = patch.sent_cents;
  if (patch.fee_cents !== undefined) row.fee_cents = patch.fee_cents;
  if (patch.fx_note !== undefined) row.fx_note = patch.fx_note;
  const { error } = await sb.from('talent_payments').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

/** The month's payroll, mirroring the retainer run. Idempotent. */
export async function payTheMonth(month?: string): Promise<number> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('pay_the_month',
    { for_month: month ?? todayInPacific() });
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
