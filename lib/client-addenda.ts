import { AGREEMENT_VERSION, AGREEMENT_SECTIONS, type AgItem } from '@/lib/agreement-text';
import refynity from '@/lib/addenda/refynity-2026-11-10.json';

/* Client-specific addenda.
   ------------------------------------------------------------------
   Most clients sign the standard Client Services Agreement as is. A client
   whose terms were negotiated (a custom hours arrangement, say) signs the same
   agreement with an addendum added to the bottom of it, so the one document
   they read, sign and receive in their signed PDF carries the whole deal.
   An addendum is matched by the signer's email address or email domain, so it
   shows on the account page, the no-login signing link, the review copy
   attached to the onboarding email, and the signed PDF, the same text everywhere.
   Adding a client: put its text in lib/addenda/, add an entry below. The
   standard text and AGREEMENT_VERSION do not change for anyone else. */

export type Addendum = {
  id: string; heading: string; items: AgItem[];
  emails?: string[]; domains?: string[];
};

export const ADDENDA: Addendum[] = [
  { ...(refynity as { id: string; heading: string; items: AgItem[] }), emails: ['shauna@refynity.co'], domains: ['refynity.co'] }
];

export function addendumFor(email?: string | null): Addendum | null {
  const e = String(email ?? '').trim().toLowerCase();
  if (!e) return null;
  const domain = e.split('@')[1] ?? '';
  return ADDENDA.find(a => a.emails?.includes(e) || (domain && a.domains?.includes(domain))) ?? null;
}

/* The version string a signer is shown and signs: the standard agreement's
   version, plus the addendum's id when they have one. */
export function agreementVersionFor(email?: string | null): string {
  const a = addendumFor(email);
  return a ? `${AGREEMENT_VERSION}+${a.id}` : AGREEMENT_VERSION;
}

/* The standard sections, with the client's addendum added at the bottom. */
export function agreementSectionsFor(email?: string | null): { h: string; items: AgItem[] }[] {
  const a = addendumFor(email);
  return a ? [...AGREEMENT_SECTIONS, { h: a.heading, items: a.items }] : AGREEMENT_SECTIONS;
}
