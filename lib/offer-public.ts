/* Client-safe half of the offer layer: types and wording only, so browser
   components can import it without dragging the server client into the
   bundle. Same split as work-public, money-public and care-public — this is
   the one mistake TypeScript does not catch and only a real build does. */

export type OfferState =
  'draft' | 'sent' | 'client_yes' | 'talent_yes' | 'accepted' | 'declined' | 'withdrawn';

export type Offer = {
  id: string; client_id: string; talent_id: string;
  role_title: string; starts_on: string; hours: string | null; scope: string | null;
  rate_month_cents: number | null; talent_pay_cents: number | null;
  minimum_months: number; state: OfferState;
  client_answer: 'yes' | 'no' | null; talent_answer: 'yes' | 'no' | null;
  declined_by: string | null; decline_reason: string | null;
  sent_on: string | null; decided_on: string | null; placement_id: string | null;
  client_name?: string; org_name?: string | null; talent_name?: string; talent_role?: string | null;
};

export const OFFER_STATE: Record<OfferState, { label: string; tone: string }> = {
  draft:      { label: 'Draft',              tone: '' },
  sent:       { label: 'Waiting on both',    tone: 'warn' },
  client_yes: { label: 'Executive said yes', tone: 'warn' },
  talent_yes: { label: 'Talent said yes',    tone: 'warn' },
  accepted:   { label: 'Accepted',           tone: 'good' },
  declined:   { label: 'Declined',           tone: 'crit' },
  withdrawn:  { label: 'Withdrawn',          tone: '' }
};
