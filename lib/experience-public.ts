/* Client-safe half of the experience layer: types, wording and small date
   helpers. No database code here, so browser components can import it. */

/* ---------- the house promise ---------- */
export const CONTACT_EMAIL = 'hello@relevestaffing.com';
export const REPLY_PROMISE = 'Replies within one business day, usually sooner.';
export const TEAM_FALLBACK = 'The Relève team';

/* ---------- the named manager ---------- */
export type Manager = {
  placement_id: string | null;
  id: string | null;            // null when nobody is assigned yet
  name: string;                 // the manager's full name, or TEAM_FALLBACK
  title: string;                // "Client Success Manager" / "Talent Success Manager"
  photo: string | null;         // a same-origin link that signs on request
};

/* ---------- message threads ---------- */
export type ThreadKey = `subject:${string}` | `placement:${string}`;
export const subjectThread = (id: string) => `subject:${id}` as ThreadKey;
export const placementThread = (id: string) => `placement:${id}` as ThreadKey;

/* ---------- tasks ---------- */
export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done';
export const TASK_STATUSES: { key: TaskStatus; label: string; client: string; talent: string }[] = [
  { key: 'todo',        label: 'To do',         client: 'To do',            talent: 'To do' },
  { key: 'in_progress', label: 'In progress',   client: 'In progress',      talent: 'In progress' },
  { key: 'waiting',     label: 'Waiting on you', client: 'Waiting on you',  talent: 'Waiting on the executive' },
  { key: 'done',        label: 'Done',          client: 'Done',             talent: 'Done' }
];
export function statusLabel(s: TaskStatus | null | undefined, side: 'client' | 'talent' | 'admin'): string {
  const row = TASK_STATUSES.find(x => x.key === (s ?? 'todo')) ?? TASK_STATUSES[0];
  if (side === 'client') return row.client;
  if (side === 'talent') return row.talent;
  return row.key === 'waiting' ? 'Waiting on the executive' : row.label;
}

export type TaskComment = {
  id: string; task_id: string; author_id: string; body: string;
  is_question: boolean; created_at: string;
};

/* ---------- the daily log ---------- */
export type DailyLog = {
  id: string; placement_id: string; talent_id: string; log_date: string;
  done_text: string | null; hours: number | null; blockers: string | null;
  highlight: string | null; share_highlight: boolean; updated_at: string;
};

/* ---------- the executive's briefing ---------- */
export type TalentBrief = {
  placement_id: string;
  tools: string | null; access: string | null; preferences: string | null;
  rhythm: string | null; ask_first: string | null;
  updated_at: string | null;
};
export const BRIEF_FIELDS: { key: keyof Omit<TalentBrief, 'placement_id' | 'updated_at'>; label: string; hint: string }[] = [
  { key: 'tools',       label: 'Tools and accounts',      hint: 'The apps you use and which ones they will work in: email, calendar, documents, CRM.' },
  { key: 'access',      label: 'Access',                  hint: 'What they can open, and how access is shared. Never paste a password here; share it through your password manager.' },
  { key: 'preferences', label: 'How you like things done', hint: 'Tone in your emails, how you want things summarised, what good looks like.' },
  { key: 'rhythm',      label: 'When and how to reach you', hint: 'Best hours, the channel for urgent things, and what can wait for a daily note.' },
  { key: 'ask_first',   label: 'Always ask first',        hint: 'Anything they should never do without checking: payments, certain people, commitments.' }
];

/* ---------- client requests ---------- */
export type RequestKind = 'replacement' | 'pause' | 'quarterly_review';
export type RequestState = 'open' | 'in_hand' | 'done' | 'declined';
export type ClientRequest = {
  id: string; placement_id: string; client_id: string; kind: RequestKind;
  note: string | null; preferred: string | null;
  pause_from: string | null; pause_until: string | null;
  state: RequestState; outcome: string | null;
  created_at: string; handled_at: string | null;
};
export const REQUEST_KINDS: { key: RequestKind; label: string; ask: string; promise: string; teamAction: string }[] = [
  { key: 'quarterly_review', label: 'Book a quarterly review',
    ask: 'Thirty minutes with your Client Success Manager to look back at the quarter and set the next one.',
    promise: 'Your Client Success Manager will write to you with times within one business day.',
    teamAction: 'Offer times for the review' },
  { key: 'replacement', label: 'Request a replacement',
    ask: 'If it is not the right fit, we find the right person. Tell us what is not working so the next match is sharper.',
    promise: 'Your Client Success Manager will call you within one business day to plan the handover. Nothing changes until you have spoken.',
    teamAction: 'Call the executive and open a replacement search' },
  { key: 'pause', label: 'Request a pause',
    ask: 'Travelling, a quiet season, or a change at work. Tell us the dates you have in mind.',
    promise: 'This is a request, not a change. Your Client Success Manager will confirm what a pause means for your schedule and billing before anything moves.',
    teamAction: 'Confirm the pause terms with the executive' }
];
export const REQUEST_STATE: { key: RequestState; label: string; tone: string }[] = [
  { key: 'open',     label: 'Received',  tone: 'warn' },
  { key: 'in_hand',  label: 'In hand',   tone: '' },
  { key: 'done',     label: 'Done',      tone: 'good' },
  { key: 'declined', label: 'Closed',    tone: '' }
];

/* ---------- the month's report ---------- */
export type MonthReport = {
  placement_id: string;
  talent_name: string;
  month: string;                         // YYYY-MM-01
  completed: { id: string; title: string; done_at: string | null }[];
  open: number;
  highlights: { date: string; text: string }[];
  hours: number;
  daysLogged: number;
  timeAway: { from: string; to: string; state: string }[];
  pulse: { going: number | null; standout: string | null; friction: string | null } | null;
  focus: { id: string; title: string; due_on: string | null; priority: string }[];
};

/* ---------- dates, in the reader's own timezone ---------- */

/** YYYY-MM-DD for "today" where the reader actually is. A bare
    toISOString() is UTC, which in Los Angeles turns 5pm into tomorrow. */
export function todayIn(tz?: string | null, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  }
}

/** The calendar day an instant falls on, in the reader's timezone. */
export function dayIn(iso: string, tz?: string | null): string {
  return todayIn(tz, new Date(iso));
}

/** Adds whole days to a YYYY-MM-DD, as a calendar date (no timezone drift). */
export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b, both YYYY-MM-DD. */
export function daysFrom(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

/** First of the month, YYYY-MM-01, for a YYYY-MM-DD or YYYY-MM. */
export function monthStart(ymd: string): string {
  return ymd.slice(0, 7) + '-01';
}

/** The month before, as YYYY-MM-01. */
export function prevMonth(ym01: string): string {
  const d = new Date(ym01.slice(0, 7) + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

/** Timezone names read "America/Los Angeles", every underscore replaced. */
export function tzLabel(tz: string | null | undefined): string {
  return (tz ?? '').replace(/_/g, ' ');
}
