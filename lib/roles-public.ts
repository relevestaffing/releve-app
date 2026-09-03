/* THE ROLE BREAKDOWN AND THE SKILLS PROFILE

   Two questionnaires answered against one shared list of work.

   The executive says, area by area, how much of it belongs to the talent:
   nothing, some of it, or all of it. The talent says how strong they are in
   the same areas and which they actually want to do.

   Because both sides answer the same list, the two can be compared directly
   — "this role is 100% inbox and calendar, and this person is expert at it
   and enjoys it" is a sentence the app can now say rather than a hope.

   Client-safe: types and wording only, no database code. */

export type Ownership = 'none' | 'shared' | 'all';
export type Level = 'no' | 'some' | 'strong' | 'expert';
export type Appetite = 'avoid' | 'fine' | 'love';

export const OWNERSHIP: { key: Ownership; label: string; hint: string }[] = [
  { key: 'none',   label: 'Not part of the role', hint: 'Stays with you or someone else entirely' },
  { key: 'shared', label: 'Shared with you',      hint: 'They help; you still hold it' },
  { key: 'all',    label: 'Entirely theirs',      hint: 'It leaves your desk and does not come back' }
];

export const LEVELS: { key: Level; label: string; hint: string }[] = [
  { key: 'no',     label: 'Not really',   hint: 'Little or no experience' },
  { key: 'some',   label: 'Some',         hint: 'Have done it, would need a steer' },
  { key: 'strong', label: 'Strong',       hint: 'Comfortable running it unsupervised' },
  { key: 'expert', label: 'This is my thing', hint: 'Could set it up from scratch and teach it' }
];

export const APPETITES: { key: Appetite; label: string }[] = [
  { key: 'avoid', label: 'Rather not' },
  { key: 'fine',  label: 'Happy to' },
  { key: 'love',  label: 'Love it' }
];

/* The areas. Deliberately about the WORK, not about job titles — a role is
   described by what actually leaves the executive's desk. */
export type Area = {
  key: string;
  name: string;
  /* What this covers, said the way an executive would say it. */
  covers: string;
  /* The concrete tasks, so nobody has to guess what the area means. */
  tasks: string[];
};

export const AREAS: Area[] = [
  { key: 'inbox', name: 'Inbox and correspondence',
    covers: 'Reading, triaging, drafting and replying on your behalf.',
    tasks: ['Triage and flag what matters', 'Draft replies in your voice',
            'Chase unanswered threads', 'Unsubscribe and keep it clean'] },

  { key: 'calendar', name: 'Calendar and scheduling',
    covers: 'Owning the diary, the conflicts, and the travel around it.',
    tasks: ['Book and reschedule', 'Protect focus time', 'Handle time zones',
            'Confirm and remind attendees'] },

  { key: 'meetings', name: 'Meeting preparation and follow-up',
    covers: 'Making sure you walk in ready and walk out with actions moving.',
    tasks: ['Agendas and briefing notes', 'Background on who you are meeting',
            'Minutes and action capture', 'Chasing the follow-ups'] },

  { key: 'travel', name: 'Travel and logistics',
    covers: 'Everything between deciding to go and getting home.',
    tasks: ['Flights, hotels, ground transport', 'Itineraries and visas',
            'Restaurant and venue booking', 'Rebooking when it falls apart'] },

  { key: 'projects', name: 'Projects and coordination',
    covers: 'Holding a piece of work together across other people.',
    tasks: ['Tracking deadlines and owners', 'Chasing other departments',
            'Status updates', 'Keeping the plan current'] },

  { key: 'docs', name: 'Documents and reporting',
    covers: 'Turning raw material into something presentable.',
    tasks: ['Decks and one-pagers', 'Spreadsheets and reporting',
            'Proofreading and formatting', 'Research and summaries'] },

  { key: 'crm', name: 'CRM, pipeline and client follow-up',
    covers: 'Keeping the commercial side moving and recorded.',
    tasks: ['Updating the CRM', 'Follow-up sequences', 'Proposal and quote prep',
            'Reporting on the pipeline'] },

  { key: 'finance', name: 'Bookkeeping and expenses',
    covers: 'The money admin, not the accounting.',
    tasks: ['Expense reports and receipts', 'Invoicing and chasing payment',
            'Subscription and vendor tracking', 'Liaising with the accountant'] },

  { key: 'social', name: 'Social, content and marketing support',
    covers: 'Publishing and keeping the presence alive.',
    tasks: ['Scheduling and posting', 'Drafting captions and newsletters',
            'Community replies and DMs', 'Basic graphics from a template'] },

  { key: 'people', name: 'Hiring and team admin',
    covers: 'The administrative half of running people.',
    tasks: ['Screening and scheduling interviews', 'Onboarding paperwork',
            'Contractor and vendor coordination', 'Keeping records tidy'] },

  { key: 'ops', name: 'Systems and process',
    covers: 'Building the machinery so things stop being ad hoc.',
    tasks: ['Documenting how things are done', 'Setting up automations',
            'Tidying shared drives', 'Choosing and configuring tools'] },

  { key: 'personal', name: 'Personal and household',
    covers: 'The life admin that eats the same hours as the business.',
    tasks: ['Appointments and reminders', 'Gifts, cards and occasions',
            'Home vendors and deliveries', 'Family calendar'] }
];

export const AREA = Object.fromEntries(AREAS.map(a => [a.key, a])) as Record<string, Area>;

/* ---------- the shapes each side saves ---------- */
export type RoleBreakdown = {
  /* area key → how much of it is the talent's */
  ownership: Record<string, Ownership>;
  /* the three or four things that matter most, in the executive's own words */
  priorities: string;
  /* what will never be delegated, however well it goes */
  never: string;
  /* the tools they must be able to use on day one */
  tools: string;
  /* what "a good week" looks like, so success is defined before it starts */
  success: string;
};

export type SkillsProfile = {
  level: Record<string, Level>;
  appetite: Record<string, Appetite>;
  tools: string;
  /* what they would say they are best at, unprompted */
  best: string;
  /* what they would rather grow into */
  growing: string;
};

/* ---------- comparing the two ---------- */

const NEED: Record<Ownership, number> = { none: 0, shared: 1, all: 2 };
const HAS: Record<Level, number> = { no: 0, some: 1, strong: 2, expert: 3 };

export type Coverage = {
  key: string; name: string;
  need: Ownership; level: Level; appetite: Appetite;
  /* covered | stretch | gap — and gap on an "entirely theirs" area is the
     one that actually sinks a placement */
  verdict: 'covered' | 'stretch' | 'gap';
  note: string;
};

export function coverage(role: RoleBreakdown | null, skills: SkillsProfile | null): Coverage[] {
  if (!role || !skills) return [];
  return AREAS
    .filter(a => (role.ownership?.[a.key] ?? 'none') !== 'none')
    .map(a => {
      const need = role.ownership[a.key];
      const level = skills.level?.[a.key] ?? 'no';
      const appetite = skills.appetite?.[a.key] ?? 'fine';
      const short = NEED[need] + 1 - HAS[level];   // >0 means they are behind

      let verdict: Coverage['verdict'] = 'covered';
      let note = '';
      if (HAS[level] === 0) {
        verdict = 'gap';
        note = need === 'all'
          ? `The role hands this over entirely and they have not done it before.`
          : `They would be learning this from scratch alongside you.`;
      } else if (short > 0) {
        verdict = 'stretch';
        note = `They can do this, but ${need === 'all' ? 'owning it outright' : 'this'} would be a step up.`;
      } else if (appetite === 'avoid') {
        verdict = 'stretch';
        note = `They are capable here but said they would rather not. Worth raising on the call.`;
      } else {
        note = appetite === 'love'
          ? `Strong here, and it is the kind of work they say they enjoy most.`
          : `Comfortable owning this.`;
      }
      return { key: a.key, name: a.name, need, level, appetite, verdict, note };
    });
}

/* One number, for the console and the shortlist. Not part of the Signature —
   this is about the work, the Signature is about the person. */
export function coverageScore(rows: Coverage[]): number | null {
  if (!rows.length) return null;
  const weight = (r: Coverage) => (r.need === 'all' ? 2 : 1);
  const got = (r: Coverage) => (r.verdict === 'covered' ? 1 : r.verdict === 'stretch' ? 0.55 : 0);
  const total = rows.reduce((n, r) => n + weight(r), 0);
  const score = rows.reduce((n, r) => n + weight(r) * got(r), 0);
  return Math.round((score / total) * 100);
}

export function roleShape(role: RoleBreakdown | null): string {
  if (!role?.ownership) return '';
  const all = AREAS.filter(a => role.ownership[a.key] === 'all');
  const shared = AREAS.filter(a => role.ownership[a.key] === 'shared');
  if (!all.length && !shared.length) return '';
  const bits: string[] = [];
  if (all.length) bits.push(`${all.map(a => a.name.toLowerCase()).slice(0, 3).join(', ')} entirely theirs`);
  if (shared.length) bits.push(`${shared.length} more shared with you`);
  return bits.join(', ');
}
