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

export type InvoiceKind = 'deposit' | 'retainer';
/* processing and failed exist because bank debit is not a card: it is
   accepted, clears days later, and can still fail after being accepted.
   Without a state for money in flight an invoice has to be called either
   unpaid, which chases a client who has paid, or paid, which is untrue until
   it lands. */
export type InvoiceStatus = 'draft' | 'sent' | 'processing' | 'paid' | 'failed' | 'void';
export type DepositStatus = 'due' | 'paid' | 'waived';

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
  client_name?: string;
  org_name?: string | null;
  talent_name?: string;
};

export const INVOICE_STATUS: { key: InvoiceStatus; label: string; tone: string }[] = [
  { key: 'draft', label: 'Draft', tone: '' },
  { key: 'sent',       label: 'Sent',     tone: 'warn' },
  { key: 'processing', label: 'Clearing', tone: '' },
  { key: 'paid',       label: 'Paid',     tone: 'good' },
  { key: 'failed',     label: 'Failed',   tone: 'crit' },
  { key: 'void',       label: 'Void',     tone: '' }
];

export const DEPOSIT_STATUS: { key: DepositStatus; label: string; tone: string }[] = [
  { key: 'due',    label: 'Deposit due',  tone: 'warn' },
  { key: 'paid',   label: 'Deposit paid', tone: 'good' },
  { key: 'waived', label: 'Waived',       tone: '' }
];

/* ---------- money ---------- */

/* Cents in, dollars out. Everything is stored as an integer number of cents
   because 0.1 + 0.2 is not 0.3 in binary floating point, and a rounding error
   in a retainer is a phone call nobody wants to make. */
export function money(cents: number | null | undefined, withCents = false): string {
  if (cents == null) return '—';
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
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/* Positive means late. Invoices are due on receipt, so anything unpaid the
   day after it was issued is already running. */
export function daysOverdue(dueOn: string | null): number {
  if (!dueOn) return 0;
  const due = new Date(dueOn + 'T00:00:00Z').getTime();
  return Math.floor((Date.now() - due) / 86_400_000);
}

/* Section 5: an invoice unpaid for fourteen days may suspend the placement. */
export function suspendable(inv: Invoice): boolean {
  return (inv.status === 'sent' || inv.status === 'draft') && daysOverdue(inv.due_on) >= 14;
}
