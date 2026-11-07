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

/* ---------- the placeholder ---------- */
/* One mark for "nothing here": a figure with no value yet, an empty field, a
   date not set. The audit found three ('–', '·', '—') on the same screens;
   the en dash is the one, everywhere. */

/* Does a typed signature belong to the name on file? Exact match, or the
   same person with a title, middle name or initial added or dropped: every
   word of the shorter name appears in the longer one, and the surnames agree.
   "Dr. Elena Marsh" signs for "Elena Marsh"; "E. Marsh" does not. */
export function sameSigner(signed: string, onFile: string) {
  const words = (v: string) => v.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(w => w && !['dr', 'mr', 'mrs', 'ms', 'mx', 'jr', 'sr', 'ii', 'iii'].includes(w));
  const a = words(signed), b = words(onFile);
  if (!a.length || !b.length) return false;
  if (a.join(' ') === b.join(' ')) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 2) return false;
  return short[short.length - 1] === long[long.length - 1] && short.every(w => long.includes(w));
}

export const DASH = '·';

/* ---------- dates ---------- */
/* One function per shape, so the same field never renders three ways.
   All of them treat a bare YYYY-MM-DD as a calendar date, not an instant —
   otherwise a date near midnight shifts a day depending on the reader's
   timezone, which is how a Friday check-in ends up filed on Thursday. */

const asUTC = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z');

/** Sep 4, 2026 — the default for anything dated. Guards against a value that
    isn't a real date (target_at, for instance, has carried free text like
    "Within six weeks" before now) so a bad value reads as unset rather than
    as the literal string "Invalid Date". */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = asUTC(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString('en-US',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** September 4 — for dates inside the current year, where the year is noise. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = asUTC(iso);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString('en-US', sameYear
    ? { day: 'numeric', month: 'long', timeZone: 'UTC' }
    : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Nov 5 — the short day, for tight columns and chips where the year is noise. */
export function fmtShortDay(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = asUTC(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** September 2026 */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return asUTC(iso).toLocaleDateString('en-US',
    { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/* Sep 4, 2:30 pm — for timestamps, which are instants and stay local.
   -------------------------------------------------------------------
   One date format for the whole app. These four helpers were formatting in
   en-GB while money-public.ts formatted in en-US, and both are used on the
   same screens: the placement page printed "Notice given 14 Oct 2026, billed
   through Oct 14, 2026" — two spellings of one date inside one sentence.
   The clock goes with them: lib/scheduling.ts has always shown 12-hour
   times, so a timestamp that read 14:30 was the only 24-hour clock in the
   product. */
export function fmtWhen(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  let s: string;
  try {
    s = d.toLocaleString('en-US',
      { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, ...(timeZone ? { timeZone } : {}) });
  } catch {
    /* An unknown zone identifier falls back to the runtime's zone rather than
       throwing inside a render. */
    s = d.toLocaleString('en-US',
      { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return s
    /* lower case, and an ordinary space before it: the rest of the app
       writes "2:30 pm", and Intl hands back "2:30 PM" with a narrow
       no-break space that copies into a search box as a mystery character. */
    .replace(/[\s\u202f]*(AM|PM)/, (_m, x) => ' ' + x.toLowerCase());
}

/** 2:30 pm — the time alone, for a timestamp whose day is already on the
    screen (a message under its day heading). Same clock as fmtWhen. */
export function fmtTime(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  let s: string;
  try {
    s = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, ...(timeZone ? { timeZone } : {}) });
  } catch {
    s = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return s.replace(/[\s\u202f]*(AM|PM)/, (_m, x) => ' ' + x.toLowerCase());
}


/* ---------- empty states ---------- */
/* A blank screen is the cheapest place to lose someone's confidence, and the
   cheapest place to earn it. Every empty state says the same three things:
   what is not here, why that is normal, and what happens next. */
export type Empty = { title: string; body: string; cta?: { label: string; href: string } };

export const EMPTY: Record<string, Empty> = {
  shortlist: {
    title: 'Your candidate is being chosen',
    body: 'Your Client Success Manager is matching the roster to your Signature and the role you described, and will put one person forward with the reasons.',
    cta: { label: 'Ask where things stand', href: '/app/messages' }
  },
  interviewsClient: {
    title: 'No interviews yet',
    body: 'Once you approve your candidate, the interview time and joining link appear here.',
    cta: { label: 'See your candidate', href: '/app/pipeline' }
  },
  interviewsTalent: {
    title: 'No interviews yet',
    body: 'When an executive asks to meet you, it appears here in your own timezone, with the link to join.',
    cta: { label: 'Check your availability', href: '/app/availability' }
  },
  tasksClient: {
    title: 'Nothing to hand over yet',
    body: 'Tasks open the day your placement starts. Write the first week\'s list together with your assistant.',
    cta: { label: 'See where your search is', href: '/app/pipeline' }
  },
  tasksTalent: {
    title: 'Nothing on your list',
    body: 'Tasks assigned to you appear here, along with any you add yourself.'
  },
  checkinUnplaced: {
    title: 'End of week reports start once you are placed',
    body: 'Each Friday you share your hours, what got done, a win and any concerns. It takes about two minutes.',
    cta: { label: 'Finish getting set up', href: '/app' }
  },
  messages: {
    title: 'No messages yet',
    body: 'Write to your Client Success Manager here. Their replies appear in this thread.'
  },
  messagesTalent: {
    title: 'No messages yet',
    body: 'Write to your Talent Success Manager here. Their replies appear in this thread.'
  },
  careClient: {
    title: 'This opens when your placement starts',
    body: 'Once your assistant starts, your monthly pulse and each step of the first ninety days appear here.'
  },
  careTalent: {
    title: 'This opens once you are placed',
    body: 'Once you start, your time off, your first ninety days and feedback on your work appear here.'
  }
};


/* A first name that never crashes a page.

   full_name is nullable on any self-serve account, and six screens called
   .split(' ')[0] on it directly — one released candidate without a name took
   the whole matches page down with a 500. */
export function firstName(full: string | null | undefined, fallback = 'them'): string {
  const n = (full ?? '').trim();
  if (!n) return fallback;
  return n.split(/\s+/)[0];
}


/* A timezone a person can read.

   The app stores IANA identifiers, which is right — they survive daylight
   saving and policy changes that a fixed offset does not. But they were
   being printed as-is, so an executive's account line read
   "America/Los_Angeles" and the talent's own timezone picker offered
   "Asia: Manila". That is a database value wearing a thin disguise.

   What somebody actually needs when they are picking a meeting time is the
   city and how far off it is from them: "Manila · GMT+8". The offset is
   computed for today, so it follows daylight saving on its own. */
export function zoneLabel(zone: string | null | undefined): string {
  const z = (zone ?? '').trim();
  if (!z) return '';
  const city = z.split('/').pop()!.replace(/_/g, ' ');
  if (z === 'UTC' || z === 'GMT') return 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: z, timeZoneName: 'shortOffset' })
      .formatToParts(new Date());
    const off = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
    return off ? `${city} · ${off.replace('GMT', 'GMT')}` : city;
  } catch {
    /* An identifier this runtime has never heard of still reads better as a
       place than as a path. */
    return city;
  }
}

/* The timezones a person can pick from, wherever one is picked. Every
   interview time either side ever sees is computed from this, so the same
   list sits behind the availability grid and both profile editors; a
   free-text field here is how "America/Los_Angeles" ended up printed back
   to an executive as if it were a place. */
export const ZONES = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Rome', 'Europe/Athens', 'Africa/Nairobi', 'Asia/Dubai', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Manila',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Australia/Perth',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC'
];
