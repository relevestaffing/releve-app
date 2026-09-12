/* Client-safe half of billing: the shape of a payment method, and nothing
   that could reach Stripe. The account number never exists on this side —
   only the last four digits, which is all anyone needs to recognise it. */
export type BillingAccount = {
  client_id: string;
  stripe_customer: string | null;
  payment_method: string | null;
  method_kind: 'us_bank_account' | 'card' | null;
  bank_name: string | null;
  last4: string | null;
  mandate_ok: boolean;
  set_up_at: string | null;
};

/* Bank debit clears in days rather than instantly, so 'processing' is a real
   state a client will see and needs explaining rather than hiding. */
export const PAYMENT_STATUS: Record<string, { label: string; tone: string; says: string }> = {
  draft:      { label: 'Not yet sent', tone: '',     says: 'Being prepared.' },
  sent:       { label: 'Due',          tone: 'warn', says: 'Due on receipt.' },
  processing: { label: 'Clearing',     tone: '',     says: 'Collected from your account and clearing. Bank transfers take a few days.' },
  paid:       { label: 'Paid',         tone: 'good', says: 'Received in full.' },
  failed:     { label: 'Failed',       tone: 'crit', says: 'Your bank refused it. We will be in touch.' },
  void:       { label: 'Void',         tone: '',     says: 'Cancelled.' }
};
