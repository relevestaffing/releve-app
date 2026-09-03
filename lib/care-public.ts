/* Client-safe half of the care layer: the things that keep a placement alive
   after it starts. Types and wording only, no database code. */

export type TeamRole = 'owner' | 'client_success' | 'talent_success' | 'manager';
export const TEAM_ROLES: { key: TeamRole; label: string; what: string }[] = [
  { key: 'owner',          label: 'Owner',                   what: 'Everything, including who else is on the team' },
  { key: 'client_success', label: 'Client Success Manager',  what: 'Looks after the executives and their placements' },
  { key: 'talent_success', label: 'Talent Success Manager',  what: 'Looks after the talent, their reviews and their time off' },
  { key: 'manager',        label: 'Manager',                 what: 'General access, no team changes' }
];

/* ---------- the executive's monthly pulse ---------- */
export type Workload = 'too_light' | 'about_right' | 'too_heavy';
export const WORKLOADS: { key: Workload; label: string }[] = [
  { key: 'too_light',   label: 'Not enough to do' },
  { key: 'about_right', label: 'About right' },
  { key: 'too_heavy',   label: 'More than they can carry' }
];

export type Pulse = {
  id: string; placement_id: string; month_of: string;
  going: number | null; workload: Workload | null;
  standout: string | null; friction: string | null;
  keep_going: boolean | null; needs_attention: boolean; filed_at: string;
  client_name?: string; talent_name?: string; org_name?: string | null;
};

export const GOING = [
  { n: 1, label: 'Struggling' },
  { n: 2, label: 'Not really working' },
  { n: 3, label: 'Fine, could be better' },
  { n: 4, label: 'Working well' },
  { n: 5, label: 'Could not be happier' }
];

/* The month a pulse covers: the first of the current month. */
export function monthOf(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/* ---------- time off ---------- */
export type TimeOffState = 'requested' | 'approved' | 'declined' | 'cancelled';
export const TIME_OFF_STATE: { key: TimeOffState; label: string; tone: string }[] = [
  { key: 'requested', label: 'Waiting on Relève', tone: 'warn' },
  { key: 'approved',  label: 'Approved',          tone: 'good' },
  { key: 'declined',  label: 'Declined',          tone: 'crit' },
  { key: 'cancelled', label: 'Cancelled',         tone: '' }
];

export type TimeOff = {
  id: string; placement_id: string; starts_on: string; ends_on: string;
  reason: string | null; state: TimeOffState; cover_note: string | null;
  requested_at: string; decided_at: string | null;
  talent_name?: string; client_name?: string; org_name?: string | null;
};

export function nights(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000) + 1;
}

/* ---------- feedback the talent sees ---------- */
export type Feedback = {
  id: string; placement_id: string; talent_id: string; period: string;
  strengths: string; growing: string | null;
  quality: number | null; communication: number | null; ownership: number | null;
  shared: boolean; written_at: string; seen_at: string | null;
  talent_name?: string;
};

export const FEEDBACK_SCORES: { key: 'quality' | 'communication' | 'ownership'; label: string; what: string }[] = [
  { key: 'quality',       label: 'Quality',       what: 'The work itself — accurate, finished, needs little sending back' },
  { key: 'communication', label: 'Communication', what: 'Clear, timely, says when something is stuck' },
  { key: 'ownership',     label: 'Ownership',     what: 'Picks things up, closes loops, does not wait to be asked' }
];

/* ---------- the first fortnight ---------- */
export type Step = {
  id: string; placement_id: string; day: number; title: string; detail: string | null;
  whose: 'client' | 'talent' | 'both'; done: boolean; done_at: string | null; sort: number;
};

export function dueOn(startedOn: string, day: number): string {
  const d = new Date(startedOn + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

/* ---------- the replacement guarantee ---------- */
export type EndedReason = 'completed' | 'client_ended' | 'talent_left' | 'not_working' | 'replaced';
export const ENDED_REASONS: { key: EndedReason; label: string; guaranteed: boolean }[] = [
  { key: 'completed',    label: 'Ran its course',            guaranteed: false },
  { key: 'client_ended', label: 'Client ended it',           guaranteed: false },
  { key: 'talent_left',  label: 'Talent left',               guaranteed: true },
  { key: 'not_working',  label: 'Not working out',           guaranteed: true },
  { key: 'replaced',     label: 'Replaced by someone else',  guaranteed: false }
];

/* Does ending it this way put Relève on the hook for a free replacement? */
export function owesReplacement(reason: EndedReason | null): boolean {
  return ENDED_REASONS.find(r => r.key === reason)?.guaranteed ?? false;
}
