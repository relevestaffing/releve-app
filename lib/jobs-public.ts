/* Client-safe half of the jobs layer: types, wording and shaping only.
   No database code, so browser components and the marketing site's own
   endpoint can share these shapes without dragging the server client in. */

export type PostState = 'draft' | 'open' | 'closed';
export type ApplicationState =
  | 'new' | 'reviewing' | 'call_booked' | 'call_held' | 'invited' | 'declined';
export type CallState = 'none' | 'invited' | 'held' | 'no_show';

export type JobPost = {
  id: string;
  slug: string;
  title: string;
  discipline: string | null;
  summary: string;
  about: string | null;
  owns: string | null;          // one per line
  needs: string | null;         // one per line
  hours: string | null;
  location: string | null;
  pay_note: string | null;
  state: PostState;
  sort: number;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobApplication = {
  id: string;
  post_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  timezone: string | null;
  years: number | null;
  links: string | null;
  resume_path: string | null;
  resume_name: string | null;
  english_speaking: EnglishLevel | null;
  english_writing: EnglishLevel | null;
  answers: Record<string, string>;
  note: string | null;
  heard_via: string | null;
  state: ApplicationState;
  /* The screening call, which happens before they have an account at all. */
  call_state: CallState;
  call_at: string | null;
  call_url: string | null;
  call_id: string | null;
  call_notes: string | null;
  call_sent_at: string | null;
  team_note: string | null;
  invited_id: string | null;
  created_at: string;
  decided_at: string | null;
  post?: { title: string; slug: string } | null;
};

export const POST_STATE: { key: PostState; label: string; tone: string; help: string }[] = [
  { key: 'draft',  label: 'Draft',  tone: '',     help: 'Only you can see it.' },
  { key: 'open',   label: 'Open',   tone: 'good', help: 'Live on the careers page, accepting applications.' },
  { key: 'closed', label: 'Closed', tone: '',     help: 'Off the site. Applications already in are kept.' }
];

export const APPLICATION_STATE: { key: ApplicationState; label: string; tone: string }[] = [
  { key: 'new',         label: 'New',            tone: 'warn' },
  { key: 'reviewing',   label: 'In review',      tone: '' },
  { key: 'call_booked', label: 'Call booked',    tone: 'warn' },
  { key: 'call_held',   label: 'Call held',      tone: '' },
  { key: 'invited',     label: 'Invited',        tone: 'good' },
  { key: 'declined',    label: 'Declined',       tone: '' }
];

/* The order the work actually happens in, so the console can group by it. */
export const APPLICATION_ORDER: ApplicationState[] =
  ['new', 'reviewing', 'call_booked', 'call_held', 'invited', 'declined'];

/* What the next move is, in the operator's own words. An application should
   never leave somebody wondering whose turn it is. */
export function whoseTurn(a: { state: ApplicationState; call_state: CallState; call_at: string | null }): string {
  if (a.state === 'declined') return 'Closed.';
  if (a.state === 'invited') return 'Waiting on them. They have the invitation and the assessment.';
  if (a.call_state === 'no_show') return 'They missed the call. Rebook it or decline.';
  if (a.call_state === 'held') return 'Decide whether to invite them.';
  if (a.call_state === 'invited') {
    if (!a.call_at) return 'A call was offered, but no time was set.';
    return new Date(a.call_at).getTime() > Date.now()
      ? 'Booked. Nothing to do until then.'
      : 'The call time has passed. Record whether it happened.';
  }
  if (a.state === 'reviewing') return 'Book the screening call, or decline.';
  return 'Read the application.';
}

/* The pipeline, as a set of buckets rather than a single status — a call can
   be booked, missed or held independently of whether Relève has decided
   anything yet, so "state" alone was never enough to say whose turn it is.
   Shared between the team-wide Applications queue and a single posting's own
   file, so the two never drift into disagreeing about where someone stands. */
export type ApplicationStageKey =
  'unread' | 'toBook' | 'booked' | 'toRecord' | 'decide' | 'inside' | 'closed';

export function applicationStages(apps: JobApplication[]): Record<ApplicationStageKey, JobApplication[]> {
  const now = Date.now();
  return {
    unread:   apps.filter(a => a.state === 'new'),
    toBook:   apps.filter(a => a.state === 'reviewing' && a.call_state === 'none'),
    booked:   apps.filter(a => a.call_state === 'invited' && a.call_at && Date.parse(a.call_at) > now),
    toRecord: apps.filter(a => (a.call_state === 'invited' && (!a.call_at || Date.parse(a.call_at) <= now))
                            || a.call_state === 'no_show'),
    decide:   apps.filter(a => a.call_state === 'held' && a.state !== 'invited' && a.state !== 'declined'),
    inside:   apps.filter(a => a.state === 'invited'),
    closed:   apps.filter(a => a.state === 'declined')
  };
}

export const APPLICATION_SECTIONS: { key: ApplicationStageKey; head: string; note: string }[] = [
  { key: 'unread',   head: 'Not yet read',
    note: 'Strong applicants do not wait long. Read these first.' },
  { key: 'toBook',   head: 'Ready for a call',
    note: 'They get no account and no assessment until you have spoken.' },
  { key: 'toRecord', head: 'Call time passed',
    note: 'Record whether it happened so the next step is clear.' },
  { key: 'decide',   head: 'Awaiting your decision',
    note: 'You have spoken. Invite them or decline.' },
  { key: 'booked',   head: 'Call booked',
    note: 'They have the time and the joining link.' },
  { key: 'inside',   head: 'Invited',
    note: 'They have an account and the assessment to complete.' },
  { key: 'closed',   head: 'Declined', note: '' }
];

/* Same three tiers a talent profile already self-rates against (see
   ProfileEditor / AddPerson) — reused here so an applicant's own words at
   the door and their profile later never disagree on what the levels mean.
   Speaking and writing are asked separately because they are not the same
   skill — a strong writer on a call is not a given, and this is an
   agency staffing remote executive support, where both are the job. */
export const ENGLISH_LEVELS = ['Native-fluent', 'Fluent', 'Conversational'] as const;
export type EnglishLevel = typeof ENGLISH_LEVELS[number];

export const HEARD_VIA = [
  'A friend or someone I have worked with',
  'Instagram',
  'Facebook',
  'LinkedIn',
  'A job board',
  'Google',
  'Somewhere else'
];

/* The handful of things worth asking everyone, whatever the role. Anything
   role-specific belongs in the posting itself, not here — the deep questions
   are the assessment, and the assessment comes after an invitation. */
export const APPLY_QUESTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'why',   label: 'Why this role?',
    hint: 'Two or three sentences is enough.' },
  { key: 'setup', label: 'Your working setup',
    hint: 'Your computer, your internet connection, and whether you have a quiet place for calls.' }
];

/* A slug that survives being typed by a human at speed. */
export function slugify(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
}

/* 'one per line' fields, rendered as a list on both the site and the console. */
export function lines(v: string | null | undefined): string[] {
  return (v ?? '').split('\n').map(s => s.replace(/^[-•·*]\s*/, '').trim()).filter(Boolean);
}

/* What a posting is missing before it can go live. Returned as sentences so
   the console can say the thing rather than mark a field red. */
export function postReady(p: Partial<JobPost>): string[] {
  const missing: string[] = [];
  if (!(p.title ?? '').trim())   missing.push('Add a title.');
  if (!(p.summary ?? '').trim()) missing.push('Add the one-line summary shown on the card.');
  if (!lines(p.owns).length)     missing.push('Add at least one line on what this person will own.');
  if (!lines(p.needs).length)    missing.push('Add at least one line on what you are looking for.'
);
  if (!(p.location ?? '').trim() && !(p.hours ?? '').trim())
    missing.push('Add the hours or the location so applicants can tell if it fits.');
  return missing;
}

export function postedAgo(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 7) return `Posted ${days} days ago`;
  if (days < 14) return 'Posted last week';
  if (days < 60) return `Posted ${Math.floor(days / 7)} weeks ago`;
  return `Posted ${Math.floor(days / 30)} months ago`;
}
