/* The house style, in one file.

   The audit found three names for the same manager, three names for the same
   pair of axis groups, three date formats for the same field and three labels
   on the same disclosure control. Individually each is trivial; together they
   are what makes an expensive product feel improvised. Everything user-facing
   should draw its wording from here.

   Client-safe: no database code, so components can import it. */

/* ---------- what we call people ---------- */
export const WORDS = {
  /* Relève's two manager roles. Use the full name on first mention in a
     screen, the short one after. Never invent a third. */
  csm: 'Client Success Manager',
  csmShort: 'your Client Success Manager',
  tsm: 'Talent Success Manager',
  tsmShort: 'your Talent Success Manager',

  /* The two sides. "Talent" is the category; a specific person is never
     called "a talent" in front of them. */
  client: 'executive',
  clientPlural: 'executives',
  talent: 'talent',
  candidate: 'candidate',

  /* The instrument. Always capitalised — it is a named asset. */
  signature: 'Signature',
  execSignature: 'Executive Signature',
  talentSignature: 'Talent Signature',

  /* The two axis groups. These names, everywhere, on both sides. */
  layer1: 'Working style',
  layer2: 'Disposition',

  /* The one label for every "there is more underneath" control. */
  moreDetail: 'See the full assessment'
} as const;

/* ---------- dates ---------- */
/* One function per shape, so the same field never renders three ways.
   All of them treat a bare YYYY-MM-DD as a calendar date, not an instant —
   otherwise a date near midnight shifts a day depending on the reader's
   timezone, which is how a Friday check-in ends up filed on Thursday. */

const asUTC = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z');

/** 4 Sep 2026 — the default for anything dated. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return asUTC(iso).toLocaleDateString('en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** 4 September — for dates inside the current year, where the year is noise. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = asUTC(iso);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString('en-GB', sameYear
    ? { day: 'numeric', month: 'long', timeZone: 'UTC' }
    : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** September 2026 */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return '—';
  return asUTC(iso).toLocaleDateString('en-GB',
    { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** 4 Sep, 14:30 — for timestamps, which are instants and stay local. */
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "3 days ago", "today", "in 2 weeks" — for how fresh something is. */
export function fmtSince(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const days = Math.round((Date.now() - asUTC(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days === -1) return 'tomorrow';
  if (days < 0) {
    const n = Math.abs(days);
    return n < 14 ? `in ${n} days` : `in ${Math.round(n / 7)} weeks`;
  }
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/* ---------- empty states ---------- */
/* A blank screen is the cheapest place to lose someone's confidence, and the
   cheapest place to earn it. Every empty state says the same three things:
   what is not here, why that is normal, and what happens next. */
export type Empty = { title: string; body: string; cta?: { label: string; href: string } };

export const EMPTY: Record<string, Empty> = {
  shortlist: {
    title: 'Your shortlist is being built',
    body: 'Nobody has been put forward yet, and that is deliberate — we do not hand you a directory to search. Your Client Success Manager reviews the bench against your Signature and puts forward only the people worth your time. Our promise is a qualified candidate within fourteen days of your search opening.',
    cta: { label: 'Ask where things stand', href: '/app/messages' }
  },
  interviewsClient: {
    title: 'No interviews yet',
    body: 'Once you tell us who you would like to meet, we arrange the time, send the invitations and put the joining link here.',
    cta: { label: 'See your shortlist', href: '/app/pipeline' }
  },
  interviewsTalent: {
    title: 'No interviews yet',
    body: 'When an executive asks to meet you, it appears here with the time in your own timezone and a link to join. You will get an email too.',
    cta: { label: 'Check your hours are right', href: '/app/availability' }
  },
  tasksClient: {
    title: 'Nothing assigned yet',
    body: 'This is where you hand work over. Add the first three things you would rather not do yourself — small and finishable beats big and vague in the first week.'
  },
  tasksTalent: {
    title: 'Nothing on your list',
    body: 'Work assigned to you appears here. You can also add your own — anything that arrived by email, a call or a note counts, and logging it is how your executive sees what you actually carry.'
  },
  checkinUnplaced: {
    title: 'Check-ins start when you are placed',
    body: 'Every Friday you will tell your Talent Success Manager how the week went — what you finished, what got stuck, and what you need. It takes two minutes and it is the main way we look after you.',
    cta: { label: 'Finish getting set up', href: '/app' }
  },
  messages: {
    title: 'No messages yet',
    body: 'This goes straight to your Relève manager — not a general inbox. Ask anything: a question about the search, something awkward about the placement, or a change you need.'
  },
  careClient: {
    title: 'Nothing here until someone starts',
    body: 'Once your talent is in place, this is where you tell us each month how it is really going, and where the first two weeks are planned out step by step.'
  },
  careTalent: {
    title: 'Nothing here until you are placed',
    body: 'Once you start, this is where you ask for time off, follow the first two weeks, and read the feedback written about your work.'
  }
};
