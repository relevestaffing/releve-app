import { configured, demoMode, supabaseServer } from '@/lib/supabase/server';
import { listCheckins, listMessages } from '@/lib/work';
import { listInvoicesFor } from '@/lib/money';
import { listPayments } from '@/lib/payout';
import { weekEnding, type Message } from '@/lib/work-public';
import { PLANS, type PlanKey, type Invoice, todayInPacific, money } from '@/lib/money-public';

/* One person's account, read for the team (3 November 2026).
   Nona: "if I go into an executive's account, I need to see their placement,
   the communication, their current billing, how many hours, what plan they
   are on. Each person has to have their own account, and it needs to be
   really simple." Everything the account page shows is gathered here, so the
   page itself is only layout. Each read stands alone: a part that cannot be
   read shows empty rather than failing the page. */

export type Side = 'client' | 'talent';

export type Plan = { key: PlanKey | 'custom'; label: string; price: string; detail: string; hoursPerWeek: number | null };

export type AccountPlacement = {
  id: string; otherId: string; otherName: string; otherSub: string | null;
  startedOn: string; endedOn: string | null; noticeOn: string | null;
  rateCents: number | null; minimumMonths: number | null; prepaidCents: number | null;
  talentPayCents: number | null; plan: Plan | null;
};

export type HoursWeek = { weekEnding: string; hours: number | null; who: string; workload: string | null; note: string | null };

export type Account = {
  side: Side;
  placements: AccountPlacement[];
  current: AccountPlacement | null;
  plan: Plan | null;
  hours: { weeks: HoursWeek[]; thisWeek: number | null; lastWeek: number | null; thisMonth: number; lastFour: number; reported: boolean };
  billing: {
    invoices: Invoice[]; paidCents: number; owedCents: number;
    next: Invoice | null; lastPaid: Invoice | null; status: { word: string; tone: '' | 'good' | 'warn' | 'crit' };
  };
  pay: { monthCents: number | null; payments: { id: string; period_start: string; amount_cents: number; state: string }[] };
  messages: Message[];
};

/* Which plan a placement is on, read from what it is billed. A plan is not
   stored by name: the offer sets the monthly rate, the minimum and, for
   Starter paid in full, the prepaid total. */
export function planOf(t: { rateCents: number | null; minimumMonths: number | null; prepaidCents: number | null }): Plan | null {
  const mk = (key: PlanKey): Plan => {
    const p = PLANS[key];
    return {
      key, label: p.label, hoursPerWeek: p.hoursPerWeek,
      price: key === 'part_time_full' ? `${money(2_500_00)} for 3 months` : `${money(p.monthlyCents)} a month`,
      detail: `${p.hoursPerWeek ? `Up to ${p.hoursPerWeek} hours a week` : 'Unlimited hours'} · ${p.months}-month commitment`
    };
  };
  if (t.prepaidCents && t.prepaidCents > 0) return mk('part_time_full');
  if (t.rateCents == null) return null;
  if (t.minimumMonths === 3 && t.rateCents <= PLANS.part_time.monthlyCents) return mk('part_time');
  const exact = (Object.keys(PLANS) as PlanKey[]).find(k => k !== 'part_time_full' && PLANS[k].monthlyCents === t.rateCents);
  if (exact) return mk(exact);
  return {
    key: 'custom', label: 'Custom', hoursPerWeek: null, price: `${money(t.rateCents)} a month`,
    detail: t.minimumMonths ? `${t.minimumMonths}-month commitment` : 'Agreed rate'
  };
}

export async function getAccount(id: string, side: Side): Promise<Account> {
  if (!configured()) return demoMode() ? demoAccount(id, side) : empty(side);

  const placements = await placementsFor(id, side).catch(() => [] as AccountPlacement[]);
  const current = placements.find(p => !p.endedOn) ?? null;

  /* Hours come from the talent's Friday reports. For an executive, that is
     the reports of whoever is placed with them. */
  const talentIds = side === 'talent' ? [id] : [...new Set(placements.map(p => p.otherId))];
  const nameOf = new Map(placements.map(p => [p.otherId, p.otherName]));
  const checkins = (await Promise.all(talentIds.map(t => listCheckins({ talentId: t, limit: 26 }).catch(() => []))))
    .flat()
    .filter(c => side === 'talent' || placements.some(p => p.id === c.placement_id));

  const [invoices, payments, messages] = await Promise.all([
    side === 'client' ? listInvoicesFor(id).catch(() => [] as Invoice[]) : Promise.resolve([] as Invoice[]),
    side === 'talent' ? listPayments(id).catch(() => [] as any[]) : Promise.resolve([] as any[]),
    listMessages(id).catch(() => [] as Message[])
  ]);

  return assemble(side, placements, current, checkins.map(c => ({
    weekEnding: c.week_ending, hours: c.hours, workload: c.workload, note: c.blocked || c.note || null,
    who: side === 'talent' ? '' : nameOf.get(c.talent_id) ?? 'Talent'
  })), invoices, payments as any, messages);
}

function assemble(side: Side, placements: AccountPlacement[], current: AccountPlacement | null, weeks: HoursWeek[],
  invoices: Invoice[], payments: Account['pay']['payments'], messages: Message[]): Account {
  weeks.sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
  const thisFriday = weekEnding();
  const month = todayInPacific().slice(0, 7);
  const sum = (ws: HoursWeek[]) => ws.reduce((n, w) => n + (w.hours ?? 0), 0);
  const lf = new Date(thisFriday + 'T00:00:00Z'); lf.setUTCDate(lf.getUTCDate() - 7);
  const lastFriday = lf.toISOString().slice(0, 10);
  const recentFridays = new Set([0, 1, 2, 3].map(i => {
    const d = new Date(thisFriday + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7 * i); return d.toISOString().slice(0, 10);
  }));

  const paid = invoices.filter(i => i.status === 'paid');
  const owing = invoices.filter(i => i.status === 'sent' || i.status === 'failed');
  const owedCents = owing.reduce((n, i) => n + i.amount_cents, 0);
  const today = todayInPacific();
  const late = owing.some(i => i.due_on && i.due_on < today) || owing.some(i => i.status === 'failed');
  const next = [...owing].sort((a, b) => (a.due_on ?? a.issued_on).localeCompare(b.due_on ?? b.issued_on))[0] ?? null;

  return {
    side, placements, current,
    plan: current?.plan ?? placements[0]?.plan ?? null,
    hours: {
      weeks,
      thisWeek: weeks.find(w => w.weekEnding === thisFriday)?.hours ?? null,
      lastWeek: weeks.find(w => w.weekEnding === lastFriday)?.hours ?? null,
      thisMonth: sum(weeks.filter(w => w.weekEnding.slice(0, 7) === month)),
      lastFour: sum(weeks.filter(w => recentFridays.has(w.weekEnding))),
      reported: weeks.length > 0
    },
    billing: {
      invoices, owedCents, next,
      paidCents: paid.reduce((n, i) => n + i.amount_cents, 0),
      lastPaid: [...paid].sort((a, b) => (b.paid_on ?? b.issued_on).localeCompare(a.paid_on ?? a.issued_on))[0] ?? null,
      status: !invoices.length ? { word: 'Nothing billed yet', tone: '' }
        : late ? { word: 'Payment late', tone: 'crit' }
        : owing.length ? { word: 'Invoice open', tone: 'warn' }
        : { word: 'Paid up', tone: 'good' }
    },
    pay: { monthCents: current?.talentPayCents ?? null, payments },
    messages
  };
}

async function placementsFor(id: string, side: Side): Promise<AccountPlacement[]> {
  const sb = await supabaseServer();
  const other = side === 'client' ? 'talent:talent_id(full_name, headline)' : 'client:client_id(full_name, org_name)';
  const { data, error } = await sb.from('placements')
    .select(`id, client_id, talent_id, started_on, ended_on, ${other}`)
    .eq(side === 'client' ? 'client_id' : 'talent_id', id)
    .order('started_on', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (!rows.length) return [];

  /* The terms are read on their own: a column that is not there yet on this
     database (prepaid total) costs that one figure, not the placement. */
  let terms = new Map<string, any>();
  for (const cols of ['placement_id, rate_month_cents, minimum_months, prepaid_total_cents, talent_pay_cents, notice_given_on',
                      'placement_id, rate_month_cents, minimum_months, talent_pay_cents, notice_given_on',
                      'placement_id, rate_month_cents']) {
    const r = await sb.from('placement_terms').select(cols).in('placement_id', rows.map(x => x.id));
    if (!r.error) { terms = new Map(((r.data ?? []) as any[]).map(t => [t.placement_id, t])); break; }
  }

  return rows.map(r => {
    const t = terms.get(r.id) ?? {};
    const o = side === 'client' ? r.talent : r.client;
    const base = {
      rateCents: t.rate_month_cents ?? null, minimumMonths: t.minimum_months ?? null,
      prepaidCents: t.prepaid_total_cents ?? null
    };
    return {
      id: r.id, otherId: side === 'client' ? r.talent_id : r.client_id,
      otherName: o?.full_name ?? (side === 'client' ? 'Talent' : 'Executive'),
      otherSub: side === 'client' ? (o?.headline ?? null) : (o?.org_name ?? null),
      startedOn: r.started_on, endedOn: r.ended_on, noticeOn: t.notice_given_on ?? null,
      talentPayCents: t.talent_pay_cents ?? null, ...base, plan: planOf(base)
    };
  });
}

function empty(side: Side): Account {
  return assemble(side, [], null, [], [], [], []);
}

/* Preview mode only: a realistic account so the page can be judged without a
   database. Elena Marsh (the sample executive) has Andrea Villanueva placed
   with her on Essential. Nothing here is ever read with a database present. */
function demoAccount(id: string, side: Side): Account {
  const isPair = (side === 'client' && id === 'demo-client') || (side === 'talent' && id === 't3');
  if (!isPair) return empty(side);
  const friday = weekEnding();
  const ago = (w: number) => { const d = new Date(friday + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7 * w); return d.toISOString().slice(0, 10); };
  const day = (n: number) => { const d = new Date(todayInPacific() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const terms = { rateCents: 250_000, minimumMonths: 6, prepaidCents: null };
  const pl: AccountPlacement = {
    id: 'demo-placement', otherId: side === 'client' ? 't3' : 'demo-client',
    otherName: side === 'client' ? 'Andrea Villanueva' : 'Elena Marsh',
    otherSub: side === 'client' ? 'Chief of Staff / Sr. EA' : 'Marsh & Co.',
    startedOn: day(-62), endedOn: null, noticeOn: null, talentPayCents: 185_000, ...terms, plan: planOf(terms)
  };
  const hours = [36, 41, 38, 40, 35, 42, 39, 37];
  const notes = [null, null, 'Waiting on deal-room access from legal', null, null, null, null, null];
  const weeks: HoursWeek[] = hours.map((h, i) => ({
    weekEnding: ago(i + (new Date().getUTCDay() >= 5 ? 0 : 1)), hours: h, workload: h > 40 ? 'heavy' : 'right',
    note: notes[i], who: side === 'client' ? 'Andrea Villanueva' : ''
  }));
  const inv = (n: string, kind: any, amount: number, issued: number, status: any, paid?: number): Invoice => ({
    id: n, number: n, client_id: 'demo-client', placement_id: 'demo-placement', search_id: null, kind,
    period_start: null, period_end: null, amount_cents: amount, issued_on: day(issued), due_on: day(issued + 7),
    status, paid_on: paid != null ? day(paid) : null, note: null
  } as Invoice);
  const invoices = side === 'client' ? [
    inv('RLV-0141', 'retainer', 250_000, -2, 'sent'),
    inv('RLV-0127', 'retainer', 200_000, -32, 'paid', -29),
    inv('RLV-0112', 'retainer', 200_000, -62, 'paid', -60),
    inv('RLV-0098', 'deposit', 50_000, -75, 'paid', -74)
  ] : [];
  const payments = side === 'talent' ? [
    { id: 'p2', period_start: day(-32).slice(0, 7) + '-01', amount_cents: 185_000, state: 'sent' },
    { id: 'p1', period_start: day(-62).slice(0, 7) + '-01', amount_cents: 185_000, state: 'sent' }
  ] : [];
  const at = (d: number, h: number) => new Date(Date.now() + d * 864e5 - h * 36e5).toISOString();
  const messages: Message[] = (side === 'client' ? [
    { body: 'Andrea has been brilliant this month. Could she take on board-deck prep from December?', team: false, at: at(-6, 3) },
    { body: 'Lovely to hear. Yes, I will brief her and add it to her week from 1 December.', team: true, at: at(-6, 1) },
    { body: 'Your November invoice is out. Same card on file, nothing to do.', team: true, at: at(-2, 2) }
  ] : [
    { body: 'Elena asked if you could take on board-deck prep from December. Happy to?', team: true, at: at(-6, 1) },
    { body: 'Yes, of course. I have done these before.', team: false, at: at(-5, 20) }
  ]).map((m, i) => ({ id: `m${i}`, subject_id: id, placement_id: null, sender_id: m.team ? 'team' : id, body: m.body,
    from_team: m.team, read_at: m.at, created_at: m.at }));
  return assemble(side, [pl], pl, weeks, invoices, payments, messages);
}

/* Who can be picked when assigning a placement from this account: talent for
   an executive, executives for a talent. Archived people are left out, and
   anyone already in a live placement is marked so the choice is informed. */
export type PickOption = { id: string; name: string; sub: string | null; busy: boolean };

export async function assignOptions(side: Side): Promise<PickOption[]> {
  const want = side === 'client' ? 'talent' : 'client';
  if (!configured()) {
    const { listPeople } = await import('@/lib/work');
    const ppl = await listPeople();
    return ppl.filter(p => p.role === want).map(p => ({
      id: p.id, name: p.full_name ?? 'Unnamed', sub: p.org_name, busy: p.id === 't3' || p.id === 'demo-client'
    }));
  }
  try {
    const sb = await supabaseServer();
    let q = sb.from('profiles').select('id, full_name, org_name, headline, archived_at').eq('role', want).order('full_name');
    let r: any = await q;
    if (r.error) r = await sb.from('profiles').select('id, full_name, org_name, headline').eq('role', want).order('full_name');
    const { data: live } = await sb.from('placements').select('client_id, talent_id').is('ended_on', null);
    const busy = new Set(((live ?? []) as any[]).map(x => (want === 'talent' ? x.talent_id : x.client_id)));
    return ((r.data ?? []) as any[]).filter(p => !p.archived_at).map(p => ({
      id: p.id, name: p.full_name ?? 'Unnamed', sub: (want === 'talent' ? p.headline : p.org_name) ?? null, busy: busy.has(p.id)
    }));
  } catch { return []; }
}

/* Whether this person is archived (hidden from every list, restorable). */
export async function isArchived(id: string): Promise<boolean> {
  if (!configured()) return false;
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.from('profiles').select('archived_at').eq('id', id).maybeSingle();
    return !error && !!(data as any)?.archived_at;
  } catch { return false; }
}
