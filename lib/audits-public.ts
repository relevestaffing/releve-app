/* The business audit: a tailored proposal written in the console for a lead,
   from a few key points, and sent as a private branded link. Shapes shared by
   the server, the console and the public audit page. */

export type AuditStatus = 'draft' | 'sent';

/* The key points she fills in after a discovery call. Everything here is
   optional except the plan path; the generator fills the reasoning around
   whatever is given, and leaves honest gaps where something is unknown. */
export type AuditInputs = {
  website?: string;         // their site, for context and the LinkedIn angle
  today?: string;           // what they have now: current spend, output, gaps
  offer?: string;           // what they sell and to whom (their ideal client)
  goals?: string;           // what they want more of (calls booked, growth)
  plan?: PlanPath;          // which Relève path this audit recommends
  elivate?: boolean;        // eLIVate Club member (applies the discount)
  notes?: string;           // anything else from the call worth weaving in
};

export type PlanPath = 'starter_then_essential' | 'essential' | 'specialist' | 'starter';

export const PLAN_PATHS: { key: PlanPath; label: string; hint: string }[] = [
  { key: 'starter_then_essential', label: 'Starter now, Essential later', hint: 'Start at $950/mo, step up to $2,500 once results show. The Refynity shape.' },
  { key: 'essential',  label: 'Essential',  hint: 'Full-time dedicated VA, $2,500/mo, 6-month term.' },
  { key: 'specialist', label: 'Specialist', hint: 'Dedicated specialist expert, $4,500/mo, 6-month term.' },
  { key: 'starter',    label: 'Starter only', hint: 'Part-time, 15 hrs/week, $950/mo, 3-month term.' }
];

export type Audit = {
  id: string; prospect_id: string; title: string;
  inputs: AuditInputs; content: string; status: AuditStatus;
  view_token: string; created_by: string | null;
  created_at: string; updated_at: string; sent_at: string | null;
};

export function auditStatusLabel(s: AuditStatus): string {
  return s === 'sent' ? 'Sent' : 'Draft';
}

/* A short, readable token for the public link. Not a secret to protect money,
   just long enough that a link is unguessable. Generated on the server. */
export function planLabel(p?: PlanPath): string {
  return PLAN_PATHS.find(x => x.key === p)?.label ?? 'Starter now, Essential later';
}
