export type ProspectStage = 'booked' | 'held' | 'proposal' | 'won' | 'lost';
export type ProspectSource = 'calendly' | 'referral' | 'linkedin' | 'website' | 'other';

export type Prospect = {
  id: string; full_name: string; email: string; org_name: string | null;
  source: ProspectSource; call_at: string | null; stage: ProspectStage;
  note: string | null; lost_reason: string | null; pending_id: string | null;
  created_at: string; updated_at: string;
};

export const PROSPECT_STAGES: { key: ProspectStage; label: string }[] = [
  { key: 'booked',   label: 'Call booked' },
  { key: 'held',     label: 'Call held' },
  { key: 'proposal', label: 'Deciding' },
  { key: 'won',      label: 'Onboarded' },
  { key: 'lost',     label: 'Passed' }
];

export const PROSPECT_SOURCES: { key: ProspectSource; label: string }[] = [
  { key: 'calendly', label: 'Calendly' },
  { key: 'referral', label: 'Referral' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'website',  label: 'Website' },
  { key: 'other',    label: 'Other' }
];

export function stageLabel(s: string): string {
  return PROSPECT_STAGES.find(x => x.key === s)?.label ?? s;
}
