/* Client-safe half of the money layer: types, wording and arithmetic only.
   No database code here, so browser components can import it without
   dragging the server client into the bundle. */

/* The effective date printed on the published documents. Bump this whenever
   the wording at relevestaffing.com/terms changes, so acceptances stay tied
   to the exact text the person actually saw. */
export const TERMS_VERSION = '2026-09-01';

export const DEPOSIT_CENTS = 50_000;          // $500, per the Terms, Section 5
export const RATE_MIN_CENTS = 250_000;        // $2,500
export const RATE_MAX_CENTS = 450_000;        // $4,500
export const MINIMUM_MONTHS = 3;
export const NOTICE_DAYS = 30;

/* The business runs on Pacific (hello@ is a Pacific mailbox). A bare
   new Date().toISOString().slice(0,10) is a UTC date, so anything recorded
   after ~4pm Pacific lands on tomorrow — which, on a money or notice action
   near a month boundary, bills an extra month. Use this for any date that
   gates money. en-CA formats as YYYY-MM-DD. */
export function todayInPacific(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}

export type InvoiceKind = 'deposit' | 'retainer';
/* processing and failed exist because bank debit is not a card: it is
   accepted, clears days later, and can still fail after being accepted.
   Without a state for money in flight an invoice has to be called either
   unpaid, which asks a client who has paid, or paid, which is untrue until
   it lands. refunded and disputed are Stripe's alone to set. */
export type InvoiceStatus = 'draft' | 'sent' | 'processing' | 'paid' | 'failed' | 'void' | 'refunded' | 'disputed';
export type DepositStatus = 'due' | 'processing' | 'paid' | 'waived';

export type Invoice = {
  id: string;
  number: string | null;
  client_id: string;
  placement_id: string | null;
  search_id: string | null;
  kind: InvoiceKind;
  period_start: string | null;
  period_end: string | null;
  amount_cents: number;
  issued_on: string;
  due_on: string | null;
  status: InvoiceStatus;
  paid_on: string | null;
  note: string | null;
  /* The document's working: what the month cost before the deposit credit,
     how much credit came off, and which days were billed. Null on invoices
     drafted before these existed, which are shown as a single line. */
  subtotal_cents?: number | null;
  deposit_credit_cents?: number | null;
  days_billed?: number | null;
  days_in_period?: number | null;
  service_from?: string | null;
  service_to?: string | null;
  refunded_cents?: number | null;
  refunded_on?: string | null;
  dispute_status?: string | null;
  failure_reason?: string | null;
  sent_at?: string | null;
  client_name?: string;
  org_name?: string | null;
  client_email?: string | null;
  talent_name?: string;
};

export const INVOICE_STATUS: { key: InvoiceStatus; label: string; tone: string }[] = [
  { key: 'draft',      label: 'Draft',    tone: '' },
  { key: 'sent',       label: 'Sent',     tone: 'warn' },
  { key: 'processing', label: 'Clearing', tone: '' },
  { key: 'paid',       label: 'Paid',     tone: 'good' },
  { key: 'failed',     label: 'Failed',   tone: 'crit' },
  { key: 'void',       label: 'Void',     tone: '' },
  { key: 'refunded',   label: 'Refunded', tone: '' },
  { key: 'disputed',   label: 'Disputed', tone: 'crit' }
];

/* What a person may set by hand. The rest belong to Stripe, and the
   database refuses them from anyone else. */
export const MANUAL_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'failed', 'void'];

export const DEPOSIT_STATUS: { key: DepositStatus; label: string; tone: string }[] = [
  { key: 'due',        label: 'Deposit due',  tone: 'warn' },
  { key: 'processing', label: 'Clearing',     tone: '' },
  { key: 'paid',       label: 'Deposit paid', tone: 'good' },
  { key: 'waived',     label: 'Waived',       tone: '' }
];

/* ---------- the terms, said one way everywhere ---------- */

/* The one sentence for notice. Every screen and email that mentions ending a
   placement uses this, word for word, so the terms are never paraphrased
   into something they do not say. */
export const NOTICE_TERMS =
  "Thirty days' written notice, effective at the end of the following billing month. The three-month minimum always applies.";

/* Who issues the invoice. No street address, by decision. */
export const INVOICE_ENTITY = {
  name: 'Relève Staffing LLC',
  email: 'hello@relevestaffing.com',
  country: 'United States'
};

/* Asked once, when notice is given, so the reason is recorded rather than
   remembered. 'fit' is the one where a covered replacement is usually the
   better answer, and the form says so. */
export const NOTICE_REASONS: { key: string; label: string }[] = [
  { key: 'role_ended',  label: 'The role is no longer needed' },
  { key: 'budget',      label: 'Budget' },
  { key: 'in_house',    label: 'Bringing it in-house' },
  { key: 'fit',         label: 'The fit is not right' },
  { key: 'other',       label: 'Something else' }
];

export function noticeReasonLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return NOTICE_REASONS.find(r => r.key === key)?.label ?? key;
}

/* ---------- money ---------- */

/* Cents in, dollars out. Everything is stored as an integer number of cents
   because 0.1 + 0.2 is not 0.3 in binary floating point, and a rounding error
   in a retainer is a phone call nobody wants to make. */
export function money(cents: number | null | undefined, withCents = false): string {
  if (cents == null) return '–';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0
  });
}

/* Accepts "3500", "$3,500" and "3500.00", and gives back whole cents. */
export function toCents(input: string): number | null {
  const n = Number(String(input).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function rateInRange(cents: number): boolean {
  return cents >= RATE_MIN_CENTS && cents <= RATE_MAX_CENTS;
}

/* ---------- dates ---------- */

/* Billing day: the first Monday of the month. Mirrors first_monday() in the
   database exactly. If you change one, change the other. */
export function firstMonday(d = new Date()): Date {
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const dow = first.getUTCDay() === 0 ? 7 : first.getUTCDay();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 + ((8 - dow) % 7)));
}

export function minimumTermEnds(startedOn: string, months = MINIMUM_MONTHS): string {
  const d = new Date(startedOn + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function monthLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function dayLabel(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/* ---------- Pacific dates ---------- */

/* Any Date, as the YYYY-MM-DD it was in Pacific. */
export function pacificDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);
}

/* The first of this month, in Pacific. A UTC month flips at 4pm Pacific on
   the last day, which bills or alerts a month early. */
export function monthStartPacific(d: Date = new Date()): string {
  return pacificDate(d).slice(0, 8) + '01';
}

/* Whole calendar days from a to b (both YYYY-MM-DD). Positive when b is later. */
export function daysBetweenISO(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* The last day of the minimum term (inclusive). minimumTermEnds() is the day
   after it, which is what the database stores. */
export function minimumLastDay(startedOn: string, months = MINIMUM_MONTHS): string {
  return addDaysISO(minimumTermEnds(startedOn, months), -1);
}

/* Mirrors notice_end_date() in the database: the end of the month after the
   one notice is given in, and never before the minimum's last day. The
   database is the record; this is for saying it before it is recorded. */
export function noticeEndsOn(givenOn: string, minimumEndsExclusive?: string | null): string {
  const d = new Date(givenOn.slice(0, 7) + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 2);
  d.setUTCDate(0);
  const endOfFollowing = d.toISOString().slice(0, 10);
  if (!minimumEndsExclusive) return endOfFollowing;
  const minLast = addDaysISO(minimumEndsExclusive, -1);
  return minLast > endOfFollowing ? minLast : endOfFollowing;
}

/* Positive means late. Invoices are due on receipt, so anything unpaid the
   day after it was issued is already running. Counted in Pacific days. */
export function daysOverdue(dueOn: string | null): number {
  if (!dueOn) return 0;
  return daysBetweenISO(dueOn, todayInPacific());
}

/* Section 5: an invoice unpaid for fourteen days may suspend the placement.
   An invoice is only outstanding once it has actually been asked for — a
   draft has not been sent, so its due date hasn't started meaning anything
   yet. Same rule moneySummary() and the Overview's "outstanding" count use
   (see the comment in lib/console.ts); this used to count drafts too, which
   could suspend a placement over an invoice nobody had even sent. */
export function suspendable(inv: Invoice): boolean {
  return (inv.status === 'sent' || inv.status === 'failed') && daysOverdue(inv.due_on) >= 14;
}
