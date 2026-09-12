/* Client-safe half of the working layer: types and display metadata only.
   No database code here, so browser components can import it. Mirrors the
   split already used by lib/signature/public.ts. */

export type Priority = 'urgent' | 'high' | 'normal' | 'low';
export type Origin = 'meeting' | 'email' | 'check_in' | 'recurring' | 'self';

export const PRIORITIES: { key: Priority; label: string }[] = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high',   label: 'High' },
  { key: 'normal', label: 'Normal' },
  { key: 'low',    label: 'Low' }
];
export const ORIGINS: { key: Origin; label: string; hint: string }[] = [
  { key: 'meeting',   label: 'From a meeting',  hint: 'Came out of a call or a conversation' },
  { key: 'email',     label: 'From email',      hint: 'Landed in the inbox' },
  { key: 'check_in',  label: 'From a check-in', hint: 'Raised in the weekly check-in' },
  { key: 'recurring', label: 'Recurring',       hint: 'Happens every week or month' },
  { key: 'self',      label: 'Self-directed',   hint: 'Spotted it and picked it up' }
];

export type Task = {
  id: string; placement_id: string; title: string; detail: string | null;
  priority: Priority; due_on: string | null; origin: Origin; origin_note: string | null;
  created_by: string; done: boolean; done_at: string | null; done_by?: string | null; created_at: string;
};
export type Placement = {
  id: string; client_id: string; talent_id: string; started_on: string;
  client_name: string; talent_name: string; org_name: string | null;
};
export type Checkin = {
  id: string; placement_id: string; talent_id: string; week_ending: string;
  shipped: string | null; blocked: string | null; rapport: number | null;
  workload: 'light' | 'right' | 'heavy' | null; note: string | null;
  needs_attention: boolean; submitted_at: string;
};
export type Message = {
  /* Exactly one of subject_id / placement_id is set. subject_id marks a
     person's thread with their Relève success manager (from_team tells
     which side); placement_id marks the direct line between a client and
     the talent they're paired with — neither side is "team" there. */
  id: string; subject_id: string | null; placement_id: string | null; sender_id: string; body: string;
  from_team: boolean; read_at: string | null; created_at: string;
};

/* The Friday that closes the current week. Check-ins file against it, so a
   talent submitting on Wednesday and one submitting on Friday land together. */
export function weekEnding(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  /* Saturday and Sunday still belong to the week that just closed: filing
     late on a Saturday used to land silently in next week's slot and the
     week that actually happened could never be filed. */
  const day = d.getUTCDay();
  const shift = day === 6 ? -1 : day === 0 ? -2 : (5 - day);   // 5 = Friday
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
}

/* ---------- shortlist decisions ---------- */
export type DecisionState = 'shortlisted' | 'passed' | 'interviewing' | 'hired';
export type Decision = {
  id: string; client_id: string; talent_id: string;
  state: DecisionState; reason: string | null; note: string | null; decided_at: string;
};
/* Why an executive passed. The single most useful field in the product for
   working out whether the Signature is predicting anything. */
/* Why an executive said yes. Not required — but the answer is the single most
   useful thing we learn from a placement that works, because it tells us what
   to look for next time rather than what to avoid. */
export const APPROVE_REASONS = [
  'The experience is exactly right',
  'They read as someone I could work with',
  'They have run this kind of role before',
  'The way they communicate suits me',
  'Strong on the tasks I most want off my plate',
  'Something else'
];

export const PASS_REASONS = [
  'Not enough experience',
  'Wrong kind of experience',
  'Hours or timezone will not work',
  'Communication was not right',
  'Someone else fitted better',
  'Role changed or is on hold',
  'Something else'
];

/* ---------- interview feedback ---------- */
export type Proceed = 'yes' | 'maybe' | 'no';
export type InterviewFeedback = {
  id: string; interview_id: string; author_id: string; side: 'client' | 'talent';
  rating: number | null; proceed: Proceed | null;
  strengths: string | null; concerns: string | null; notes: string | null; created_at: string;
};

/* ---------- vetting ---------- */
export type VettingKind = 'identity' | 'nda' | 'agreement' | 'right_to_work';
export type VettingState = 'not_started' | 'submitted' | 'verified' | 'rejected' | 'expired';
export type Vetting = {
  id: string; talent_id: string; kind: VettingKind; state: VettingState;
  file_path: string | null; file_name: string | null;
  submitted_at: string | null; verified_at: string | null; expires_on: string | null;
  issued_by_team?: boolean; envelope_id?: string | null;
  note: string | null; reject_reason: string | null; updated_at: string;
};
export const VETTING_ITEMS: {
  kind: VettingKind; label: string; ask: string; why: string;
  expires: boolean; issuedByTeam: boolean;
}[] = [
  { kind: 'identity', label: 'Proof of identity',
    ask: 'A clear photo or scan of your passport, or a government photo ID.',
    why: 'Executives are handing over calendars, inboxes and sometimes finances. Knowing who you are is the floor.',
    expires: true, issuedByTeam: false },
  { kind: 'agreement', label: 'Your agreement with Relève',
    ask: 'Your contractor agreement and NDA. We send it to you, you sign it, and we file it here.',
    why: '',
    expires: false, issuedByTeam: true }
];

export const VETTING_WORDING: Record<VettingState, string> = {
  not_started: 'Not started', submitted: 'With Relève', verified: 'Verified',
  rejected: 'Needs another go', expired: 'Expired'
};
