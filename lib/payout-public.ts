/* Client-safe half of paying people: types and wording only. */

export type PayoutMethod = 'wise' | 'payoneer' | 'bank' | 'paypal' | 'other';

export type Payout = {
  talent_id: string;
  method: PayoutMethod;
  beneficiary: string;
  country: string | null;
  currency: string;
  detail: string | null;
  note: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  updated_at: string;
  /* Tax residency, declared by the person. Paying somebody outside the United
     States who is not a US person generally wants a W-8BEN on file first, and
     the app collected nothing at all — so the question would have been
     discovered during the first payout run rather than before it.

     No tax identification number is stored, ever. Same rule as identity
     documents, and for the same reason: Relève holds the declaration and the
     signed form, never the number. */
  tax_residence: string | null;
  us_person: boolean | null;
  tax_form_on_file: boolean;
  tax_form_signed_on: string | null;
};

export type PaymentState = 'due' | 'sent' | 'failed';

export type TalentPayment = {
  id: string;
  talent_id: string;
  placement_id: string | null;
  period_start: string;
  period_end: string;
  amount_cents: number;
  currency: string;
  state: PaymentState;
  method: string | null;
  reference: string | null;
  sent_on: string | null;
  note: string | null;
  created_at: string;
  talent_name?: string;
};

/* Named for the person filling it in, not for the payments industry. */
export const PAYOUT_METHODS: { key: PayoutMethod; label: string; asks: string; hint: string }[] = [
  { key: 'wise',     label: 'Wise',
    asks: 'The email address on your Wise account',
    hint: 'Usually the cheapest and quickest way for us to send money abroad.' },
  { key: 'payoneer', label: 'Payoneer',
    asks: 'The email address on your Payoneer account',
    hint: 'Widely used across the Philippines and easy to withdraw from.' },
  { key: 'bank',     label: 'Straight to my bank',
    asks: 'Bank name, account number, and any SWIFT or routing code',
    hint: 'Slower and sometimes carries a receiving fee at your end.' },
  { key: 'paypal',   label: 'PayPal',
    asks: 'The email address on your PayPal account',
    hint: 'Simple, though PayPal takes a larger cut than the others.' },
  { key: 'other',    label: 'Something else',
    asks: 'Tell us how, and everything we need to send it',
    hint: 'If none of the above suits you, describe what does.' }
];

/* One shared source for the tax-residency prompt, reused everywhere it is
   asked — the payout API's two validation states and the setup checklist —
   so the wording can't quietly drift apart from being hand-typed in three
   places. TAX_COUNTRY_PROMPT stays a separate string because it asks a
   different, later question (which country, not whether one's been given). */
export const TAX_RESIDENCE_PROMPT = 'Tell us where you are tax resident';
export const TAX_COUNTRY_PROMPT = 'Which country are you tax resident in?';

export const PAYMENT_STATE: { key: PaymentState; label: string; tone: string }[] = [
  { key: 'due',    label: 'Due',    tone: 'warn' },
  { key: 'sent',   label: 'Sent',   tone: 'good' },
  { key: 'failed', label: 'Failed', tone: 'crit' }
];

export function payoutReady(p: Partial<Payout> | null): boolean {
  return !!(p && p.method && (p.beneficiary ?? '').trim() && (p.detail ?? '').trim()
    && taxAnswered(p));
}

/* The person has answered the tax question. Whether Relève then needs a form
   from them is a separate matter — that is taxClear below, and it is Relève's
   job rather than theirs, so it must never block their setup checklist. */
export function taxAnswered(p: Partial<Payout> | null): boolean {
  return !!(p && p.us_person !== null && p.us_person !== undefined
    && (p.us_person === true || (p.tax_residence ?? '').trim().length > 1));
}

/* Safe to pay. A non-US person needs the signed form held before money moves;
   the payroll desk reads this so the question is answered before a payment
   run rather than during one. */
export function taxClear(p: Partial<Payout> | null): boolean {
  if (!p) return false;
  if (p.us_person === true) return true;
  return Boolean(p.tax_form_on_file);
}

export function taxNote(p: Partial<Payout> | null): string | null {
  if (!p || !taxAnswered(p)) return 'Tax residence not declared yet.';
  if (p.us_person === true) return null;
  if (p.tax_form_on_file) return null;
  return `W-8BEN not yet held for ${(p.tax_residence ?? 'this person').trim()}.`;
}

/* What is still missing, in sentences rather than red fields. */
export function payoutMissing(p: Partial<Payout> | null): string[] {
  if (!p || !p.method) return ['Choose how you would like to be paid.'];
  const out: string[] = [];
  if (!(p.beneficiary ?? '').trim()) out.push('We need the name on the account, exactly as it appears there.');
  if (!(p.detail ?? '').trim()) out.push('We need the account details themselves.');
  if (!taxAnswered(p)) out.push(`${TAX_RESIDENCE_PROMPT} — one question, below.`);
  return out;
}

export function periodLabel(start: string): string {
  return new Date(start + 'T00:00:00Z')
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
