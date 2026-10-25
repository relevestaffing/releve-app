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

/** Sep 4, 2026 — the default for anything dated. Guards against a value that
    isn't a real date (target_at, for instance, has carried free text like
    "Within six weeks" before now) so a bad value reads as unset rather than
    as the literal string "Invalid Date". */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = asUTC(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('en-US',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** September 4 — for dates inside the current year, where the year is noise. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = asUTC(iso);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString('en-US', sameYear
    ? { day: 'numeric', month: 'long', timeZone: 'UTC' }
    : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** September 2026 */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return '–';
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
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('en-US',
    { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    /* lower case, and an ordinary space before it: the rest of the app
       writes "2:30 pm", and Intl hands back "2:30 PM" with a narrow
       no-break space that copies into a search box as a mystery character. */
    .replace(/[\s\u202f]*(AM|PM)/, (_m, x) => ' ' + x.toLowerCase());
}


/* ---------- empty states ---------- */
/* A blank screen is the cheapest place to lose someone's confidence, and the
   cheapest place to earn it. Every empty state says the same three things:
   what is not here, why that is normal, and what happens next. */
export type Empty = { title: string; body: string; cta?: { label: string; href: string } };

export const EMPTY: Record<string, Empty> = {
  shortlist: {
    title: 'Your candidate is being chosen',
    body: 'Nobody has been put forward yet, and that is deliberate: we do not hand you a stack to sort through. Your Client Success Manager reviews the roster against your Signature and the role you described, then puts forward one person worth your time. Our promise is a qualified candidate within fourteen days of your search opening.',
    cta: { label: 'Ask where things stand', href: '/app/messages' }
  },
  interviewsClient: {
    title: 'No interviews yet',
    body: 'Once you approve your candidate, we arrange the time, send the invitations and put the joining link here.',
    cta: { label: 'See your candidate', href: '/app/pipeline' }
  },
  interviewsTalent: {
    title: 'No interviews yet',
    body: 'When an executive asks to meet you, it appears here with the time in your own timezone and a link to join. You will get an email too.',
    cta: { label: 'Check your hours are right', href: '/app/availability' }
  },
  tasksClient: {
    title: 'Nothing to hand over yet',
    body: 'This is where you assign work and watch it move, once someone is in the seat. There is nothing to add until your placement starts, which is deliberate: the first week goes better when the list is written with them, not before they arrive.',
    cta: { label: 'See where your search is', href: '/app/pipeline' }
  },
  tasksTalent: {
    title: 'Nothing on your list',
    body: 'Work assigned to you appears here. You can also add your own: anything that arrived by email, a call or a note counts, and logging it is how your executive sees what you actually carry.'
  },
  checkinUnplaced: {
    title: 'Your end of week report starts when you are placed',
    body: 'Every Friday you will send your Talent Success Manager your hours, what you accomplished, a win from the week and any concerns. It takes two minutes and it is the main way we look after you.',
    cta: { label: 'Finish getting set up', href: '/app' }
  },
  messages: {
    title: 'No messages yet',
    body: 'This goes straight to your Success Manager, not a general inbox. Ask anything: a question about the search, something awkward about the placement, or a change you need. A person reads every one and replies within one business day, usually sooner.'
  },
  careClient: {
    title: 'Nothing here until someone starts',
    body: 'Once your talent is in place, this is where you tell us each month how it is really going, and where your first ninety days are planned out step by step.'
  },
  careTalent: {
    title: 'Nothing here until you are placed',
    body: 'Once you start, this is where you ask for time off, follow your first ninety days, and read the feedback written about your work.'
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
