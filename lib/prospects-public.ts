/* The lead pipeline, from first interest to signed client. One record per
   person; a lead is just an earlier stage of a prospect. The board on the
   console (a Monday-style grouped table) and everywhere else read their
   stages, sources and colours from here. */

export type ProspectStage =
  | 'new' | 'contacted' | 'nurturing'   // a lead, before a call is booked
  | 'booked' | 'held' | 'proposal'      // in conversation
  | 'won' | 'lost';                      // decided

export type ProspectSource =
  | 'calendly' | 'referral' | 'linkedin' | 'instagram' | 'website' | 'event' | 'other';

export type TouchKind = 'note' | 'call' | 'email' | 'message' | 'meeting';

export type Prospect = {
  id: string; full_name: string; email: string; org_name: string | null;
  source: ProspectSource; call_at: string | null; stage: ProspectStage;
  note: string | null; lost_reason: string | null; pending_id: string | null;
  next_follow_up: string | null; last_touched_at: string | null; owner_id: string | null;
  created_at: string; updated_at: string;
};

export type Touch = {
  id: string; prospect_id: string; at: string; by: string | null;
  kind: TouchKind; note: string | null; next_follow_up: string | null;
};

/* Each stage carries its own colour, so the board reads at a glance the way a
   Monday board does: a solid status label per row, a coloured bar per group.
   The colours stay inside Relève's world (ferns, golds, a plum for deciding,
   terracotta for passed) rather than the primary brights, so the board looks
   considered, not loud. */
export const PROSPECT_STAGES: { key: ProspectStage; label: string; color: string; group: StageGroup }[] = [
  { key: 'new',       label: 'New lead',    color: '#6E8CA8', group: 'leads' },        // slate blue
  { key: 'contacted', label: 'Contacted',   color: '#C6A465', group: 'leads' },        // gold
  { key: 'nurturing', label: 'Nurturing',   color: '#7FA98B', group: 'leads' },        // soft fern
  { key: 'booked',    label: 'Call booked', color: '#4E7A5C', group: 'conversation' }, // fern
  { key: 'held',      label: 'Call held',   color: '#3E6B6E', group: 'conversation' }, // teal
  { key: 'proposal',  label: 'Deciding',    color: '#8A6DA3', group: 'conversation' }, // plum
  { key: 'won',       label: 'Signed',      color: '#35443A', group: 'decided' },      // deep fern
  { key: 'lost',      label: 'Passed',      color: '#A08478', group: 'decided' }        // muted terracotta
];

export type StageGroup = 'leads' | 'conversation' | 'decided';
export const STAGE_GROUPS: { key: StageGroup; label: string }[] = [
  { key: 'leads',        label: 'Leads' },
  { key: 'conversation', label: 'In conversation' },
  { key: 'decided',      label: 'Signed and passed' }
];

export const PROSPECT_SOURCES: { key: ProspectSource; label: string }[] = [
  { key: 'calendly',  label: 'Calendly' },
  { key: 'referral',  label: 'Referral' },
  { key: 'linkedin',  label: 'LinkedIn' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'website',   label: 'Website' },
  { key: 'event',     label: 'Event' },
  { key: 'other',     label: 'Other' }
];

export const TOUCH_KINDS: { key: TouchKind; label: string }[] = [
  { key: 'note',    label: 'Note' },
  { key: 'call',    label: 'Call' },
  { key: 'email',   label: 'Email' },
  { key: 'message', label: 'Message' },
  { key: 'meeting', label: 'Meeting' }
];

export function stageLabel(s: string): string {
  return PROSPECT_STAGES.find(x => x.key === s)?.label ?? s;
}
export function stageColor(s: string): string {
  return PROSPECT_STAGES.find(x => x.key === s)?.color ?? '#6E8073';
}
export function stageGroup(s: string): StageGroup {
  return PROSPECT_STAGES.find(x => x.key === s)?.group ?? 'leads';
}
export function sourceLabel(s: string): string {
  return PROSPECT_SOURCES.find(x => x.key === s)?.label ?? s;
}
export function isOpenStage(s: string): boolean {
  return s !== 'won' && s !== 'lost';
}

/* Is this lead due to be followed up with as of `today` (a YYYY-MM-DD string
   in the business's timezone)? Overdue counts as due. Won and lost never do. */
export function followUpDue(p: { stage: ProspectStage; next_follow_up: string | null }, today: string): boolean {
  return isOpenStage(p.stage) && !!p.next_follow_up && p.next_follow_up <= today;
}
