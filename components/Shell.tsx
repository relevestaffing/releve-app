import Link from 'next/link';
import { redirect } from 'next/navigation';
import { configured, type Profile } from '@/lib/supabase/server';
import { getSelfProfile } from '@/lib/store';
import DemoSwitch from './DemoSwitch';
import MobileNav from './MobileNav';
import QuickBar, { quickItems } from './QuickBar';
import HomeJump from './HomeJump';
import HomeStage, { type Lead, MATERIALS } from './native/HomeStage';
import ScreenRail from './native/ScreenRail';
import Motion from './Motion';
import PageLift from './PageLift';
import PullRefresh from './PullRefresh';
import BackButton from './BackButton';
import Flourish from './Flourish';
import TermsGate from './TermsGate';
import InvoiceGate from './InvoiceGate';
import BillingBanner from '@/components/BillingBanner';
import PushSetup from '@/components/PushSetup';
import { hasAccepted, TERMS_VERSION } from '@/lib/money';
import { unpaidInvoiceFor } from '@/lib/billing';
import { stripeReady } from '@/lib/stripe';
import { executiveStage, execInTour } from '@/lib/stage';
import { listPlacementsFor } from '@/lib/work';
import { firstName } from '@/lib/words';
import { teamUnreadCount, unreadTotal } from '@/lib/experience';
import UnreadSync from './UnreadSync';
import UnreadBadge from './UnreadBadge';
import AskWidget from './AskWidget';
import { isOwner } from '@/lib/money';
import './experience.css';
import './smooth.css';
import SunWall from '@/components/SunWall';
import HeaderScroll from '@/components/HeaderScroll';
import './appframe.css';
import { cookies } from 'next/headers';

/* Grouped, not flat. Fifteen undifferentiated links is a filing cabinet;
   four labelled groups is a product. Nothing is removed — everything stays
   reachable — but the eye now lands on a heading first.

   Labels here must match each page's own <Shell title>, or the sidebar and
   the page disagree about what you are looking at. */
type NavItem = { href: string; label: string; hint?: string };
type NavGroup = { group?: string; items: NavItem[] };

const NAV: Record<string, NavGroup[]> = {
  /* The executive menu is built per account by clientNav() below — this entry
     is the shape it starts from, and the fallback if the stage cannot be
     read. */
  client: [
    { items: [{ href: '/app', label: 'Dashboard' }] },
    { group: 'Your brief', items: [
      { href: '/app/signature', label: 'Executive Signature™' },
      { href: '/app/role', label: 'The role' },
      { href: '/app/profile', label: 'Your profile' }
    ]},
    { group: 'Hiring', items: [
      { href: '/app/pipeline', label: 'Your candidate' },
      { href: '/app/interviews', label: 'Interviews' },
      { href: '/app/availability', label: 'Availability' }
    ]},
    { group: 'Working together', items: [
      { href: '/app/care', label: 'Your placement' },
      { href: '/app/tasks', label: 'Tasks' },
      { href: '/app/billing', label: 'Billing' }
    ]},
    { items: [{ href: '/app/messages', label: 'Messages' }] }
  ],

  talent: [
    { items: [{ href: '/app', label: 'Dashboard' }] },
    { group: 'About you', items: [
      { href: '/app/signature', label: 'Talent Signature™' },
      { href: '/app/skills', label: 'Your skills' },
      { href: '/app/talent', label: 'Your profile' },
      { href: '/app/watch', label: 'Taking The Watch™' },
      { href: '/app/vetting', label: 'Verification' }
    ]},
    { group: 'Opportunities', items: [
      { href: '/app/interviews', label: 'Interviews' },
      { href: '/app/availability', label: 'Availability' }
    ]},
    { group: 'Working', items: [
      { href: '/app/care', label: 'Your placement' },
      { href: '/app/tasks', label: 'Tasks' },
      { href: '/app/log', label: 'Daily log' },
      { href: '/app/brief', label: 'Your briefing' },
      { href: '/app/checkin', label: 'End of week report' },
      { href: '/app/pay', label: 'Your pay' }
    ]},
    { items: [{ href: '/app/messages', label: 'Messages' }] }
  ],

  /* Nineteen entries in six groups became eight (Sage, 25 October 2026:
     "it needs to be very straightforward, very clean cut"). The rule used
     to pick them: one entry per job she actually does, named for the job
     rather than for the table behind it. Everything that used to have its
     own entry still exists, as a tab, a column or a row action on the page
     that owns that job. The order follows the business: who we have, how we
     find more, how we pair them, how it is going, what it earns.

     The old routes all still resolve, so nothing anyone bookmarked breaks. */
  admin: [
    { items: [
      { href: '/console', label: 'Overview' },
      { href: '/console/directory', label: 'Directory' },
      { href: '/console/recruiting', label: 'Recruiting' },
      { href: '/console/matching', label: 'Matching' },
      { href: '/console/placements', label: 'Placements' },
      { href: '/console/money', label: 'Billing' },
      { href: '/console/messages', label: 'Messages' },
      { href: '/console/content', label: 'Content' }
    ] },
    /* Looked at monthly, not daily, so it sits apart rather than competing
       with the seven above. */
    { items: [
      { href: '/console/business', label: 'The business' }
    ]}
  ]
};

/* What each place is for, in plain words (4 November 2026). Nona: keep the
   names, add a line, so a busy founder or a talent reading in their second
   language knows where they are going before they tap. Shown under each
   name in the More menu and on a screen's own card. Keyed by role, then href. */
const HINTS: Record<string, Record<string, string>> = {
  client: {
    '/app/signature': 'Your working-style assessment', '/app/role': 'What your assistant will own',
    '/app/profile': 'Your details and how you work', '/app/pipeline': 'The person we chose for you',
    '/app/interviews': 'Book and join your interviews', '/app/availability': 'When you are free to meet',
    '/app/care': 'Your assistant, their plan and requests', '/app/tasks': 'Hand over work and review what is done',
    '/app/report': 'What got done this month', '/app/billing': 'Invoices, payments and your plan',
    '/app/messages': 'Write to your Client Success Manager', '/app/how': 'The process, step by step',
    '/app/delegate': 'Ideas for what to hand over', '/app/value': 'What it gives you back',
    '/app/agreement': 'Read and sign your agreement', '/app/resources': 'Free guides and templates'
  },
  talent: {
    '/app/signature': 'Your working-style assessment', '/app/skills': 'The work you are strongest at',
    '/app/talent': 'What executives see about you', '/app/watch': 'Your skills test: a real day of work',
    '/app/vetting': 'Identity, right to work and agreement', '/app/interviews': 'Book and join your interviews',
    '/app/availability': 'When you are free to meet', '/app/care': 'Who you work for and your plan',
    '/app/tasks': 'Your work, from your executive and you', '/app/log': 'A two-minute note at the end of each day',
    '/app/brief': 'Your executive’s tools and preferences', '/app/checkin': 'Every Friday, to your Talent Success Manager',
    '/app/pay': 'Your rate, payout method and payments', '/app/messages': 'Write to Relève and your executive'
  },
  admin: {
    '/console/directory': 'Leads, executives and talent', '/console/recruiting': 'Applications, introductions and job posts',
    '/console/matching': 'Pair talent with open searches, and offers', '/console/placements': 'Everyone in seat, Friday reports, requests',
    '/console/money': 'Invoices, payroll and the monthly run', '/console/messages': 'Every conversation with clients and talent',
    '/console/content': 'Social posts, the Letter and the email list', '/console/business': 'Reports, calendar, booking page and team'
  }
};
const withHints = (role: string, groups: NavGroup[]) => groups.map(g => ({ ...g,
  items: g.items.map(i => ({ ...i, hint: HINTS[role]?.[i.href.replace(/\/care\/[^/]+$/, '/care')] })) }));
const WHO: Record<string, string> = { client: 'Executive account', talent: 'Talent account', admin: 'Relève console' };

/* Where the logo and the account name each go. The logo is always "home" —
   the dashboard for whoever is signed in. The name is always "you" — the one
   page that is about the person rather than the work, which is exactly why
   it lives behind the name and not the dashboard now. Admin has no such page
   yet, so its name stays plain text rather than a link that goes nowhere. */
const HOME: Record<string, string> = { client: '/app', talent: '/app', admin: '/console' };
const PROFILE: Record<string, string> = { client: '/app/profile', talent: '/app/talent' };

/* The executive's menu, built for the stage their account is in.
   -------------------------------------------------------------
   Hiring screens exist only while a search is open. That rule, rather than
   "do they have somebody", is what lets an executive keep one assistant and
   still hire a second: Relève opens a search, the screens come back.

   Placements are listed by name once there is more than one, because "Your
   Placement" is a lie the moment there are two, and a person is easier to
   aim at than a heading. */
async function clientNav(profile: Profile): Promise<NavGroup[]> {
  const stage = await executiveStage(profile.id);

  /* Before the deposit, the menu is the onboarding tour, not the working app.
     The three vision screens are the whole of it, ending at the deposit on the
     dashboard; the Signature, the role brief and everything else only appear
     once the search is actually open. Keeping the menu this short is the point
     — nothing here to wander into before the one thing that matters. */
  if (await execInTour(profile.id)) {
    return [
      { items: [{ href: '/app', label: 'Dashboard' }] },
      { group: 'Getting started', items: [
        { href: '/app/how', label: 'How Relève works' },
        { href: '/app/delegate', label: 'What to delegate' },
        { href: '/app/value', label: 'The value' }
      ]},
      { items: [{ href: '/app/agreement', label: 'Your agreement' }] },
      { items: [{ href: '/app/messages', label: 'Messages' }] },
      { items: [{ href: '/app/resources', label: 'Free resources' }] }
    ];
  }

  const nav: NavGroup[] = [{ items: [{ href: '/app', label: 'Dashboard' }] }];

  const brief: NavItem[] = [
    { href: '/app/signature', label: 'Executive Signature™' }
  ];
  /* The role brief describes a search. With none open it is a document about
     something finished, so it goes with the hiring screens rather than
     sitting in the menu inviting edits nobody will read. What-to-delegate
     rides alongside it while hiring, where picturing the role is the job. */
  if (stage.hiring) {
    brief.push({ href: '/app/delegate', label: 'What to delegate' });
    brief.push({ href: '/app/role', label: 'The role' });
  }
  brief.push({ href: '/app/profile', label: 'Your profile' });
  nav.push({ group: 'Your brief', items: brief });

  if (stage.hiring) {
    nav.push({ group: 'Hiring', items: [
      { href: '/app/pipeline', label: 'Your candidate' },
      { href: '/app/interviews', label: 'Interviews' },
      { href: '/app/availability', label: 'Availability' }
    ]});
  }

  if (stage.placed) {
    const placements = await listPlacementsFor(profile.id);
    const items: NavItem[] = placements.length > 1
      ? placements.map(p => ({ href: `/app/care/${p.id}`, label: firstName(p.talent_name) }))
      : [{ href: '/app/care', label: 'Your placement' }];
    nav.push({
      group: placements.length > 1 ? 'Your team' : 'Working together',
      items: [...items,
        { href: '/app/tasks', label: 'Tasks' },
        { href: '/app/report', label: 'Your month' },
        { href: '/app/billing', label: 'Billing' }]
    });
  } else {
    /* Billing exists from the deposit onward, so it cannot wait for a
       placement — an executive who has paid to open a search must be able to
       see what they paid. */
    nav.push({ group: 'Working together', items: [{ href: '/app/billing', label: 'Billing' }] });
  }

  nav.push({ items: [{ href: '/app/messages', label: 'Messages' }] });
  /* The vision screens recede here once the deposit is in — out of the daily
     menu, but one link away for a client who wants to revisit them. */
  nav.push({ items: [{ href: '/app/how', label: 'How Relève works' }] });
  nav.push({ items: [{ href: '/app/resources', label: 'Free resources' }] });
  return nav;
}

/* The talent's menu. The working screens (daily log, the executive's
   briefing, check-ins) only mean something once somebody is placed. */
async function talentNav(profile: Profile): Promise<NavGroup[]> {
  const placed = (await listPlacementsFor(profile.id)).length > 0;
  if (placed) return NAV.talent;
  /* Before a placement there is no daily log, no end-of-week report and no
     pay, so those three entries wait until there is. Tasks and messages stay,
     since Relève writes to people on the roster too. */
  return NAV.talent.map(g => g.group === 'Working'
    ? { ...g, items: g.items.filter(i => !['/app/log', '/app/brief', '/app/checkin', '/app/pay'].includes(i.href)) }
    : g);
}

function askStarters(role: string, founder: boolean): string[] {
  if (role === 'client') return ['How does the matching work?', 'What happens after I approve a candidate?', 'When is my first invoice?', 'What does the guarantee cover?'];
  if (role === 'talent') return ['What is left on my checklist?', 'How is The Watch scored?', 'How am I paid?', 'What happens once I am placed?'];
  return founder
    ? ['What is waiting on me today?', 'Show me this week\u2019s posts', 'Which invoices are open?', 'Hold next Tuesday\u2019s Letter']
    : ['What is waiting on the team today?', 'Which interviews are coming up?', 'What does the Book say about releases?'];
}

/* The quiet line under the phone's bottom bar, the way Open shows the sunset:
   the next date that matters to this account. */
function horizonLine(role: string): string {
  const now = new Date(Date.now() - 8 * 3600 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const when = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  if (role === 'admin') return `Invoices go out ${when}`;
  if (role === 'client') return `Next invoice ${when}`;
  return `Friday report due each week`;
}

/* Phone layouts (Nona, 4 November 2026: "what I like about Open is that
   each page is different and doesn't look identical"). Every screen takes
   the layout that suits what it is for; they share only the wall, Lora and
   silver. Deeper screens not listed stay type only on the wall. */
type PhoneLayout = 'gallery' | 'fullbleed' | 'index' | 'ledger' | 'agenda' | 'conversation';
const LAYOUTS: [PhoneLayout, string[]][] = [
  ['conversation', ['/app/messages', '/console/messages', '/app/ask', '/console/ask']],
  ['ledger', ['/app/billing', '/console/money', '/app/pay', '/app/report', '/app/value', '/app/agreement']],
  ['agenda', ['/app/interviews', '/console/interviews', '/app/availability', '/console/calendar', '/app/log', '/app/checkin', '/app/tasks']],
  ['index', ['/console/team', '/console/reports', '/console/business', '/console/content', '/console/signals', '/console/email-list', '/console/campaigns', '/console/booking']],
  ['fullbleed', ['/app/pipeline', '/app/care', '/app/profile', '/app/talent', '/app/signature', '/app/role', '/app/brief', '/app/vetting', '/console/care', '/console/checkins']],
  ['gallery', ['/console/directory', '/console/people', '/console/applications', '/console/postings', '/console/bench', '/console/prospects', '/console/matching', '/console/placements', '/console/offers', '/console/recruiting', '/app/resources', '/app/how', '/app/delegate', '/app/skills', '/app/watch']]
];
function layoutFor(active: string): PhoneLayout | null {
  for (const [name, list] of LAYOUTS) if (list.some(h => active === h || active.startsWith(h + '/'))) return name;
  return null;
}

function defaultLead(role: string, unread: number, messagesHref: string): Lead {
  const eyebrow = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
  if (unread > 0) return { eyebrow, title: `${unread} new message${unread === 1 ? '' : 's'}`, meta: 'Waiting for you in Messages', href: messagesHref, cta: 'Open messages' };
  const href = role === 'admin' ? '/console/money' : role === 'client' ? '/app/billing' : '/app/report';
  return { eyebrow, title: horizonLine(role), href };
}

async function unreadCount(profile: Profile): Promise<number> {
  if (!configured()) return 0;
  try {
    return profile.role === 'admin' ? await teamUnreadCount() : await unreadTotal();
  } catch { return 0; }
}

/* The page title, word by word: each word rises out of its own mask in
   turn, the way the website's hero headline does (see .topbar h1 .w in
   app/evergreen.css). Whatever follows a comma ("Good afternoon, Elena")
   is the name, set in the pale green. */
function Title({ text }: { text: string }) {
  const i = text.indexOf(', ');
  const nameFrom = i > 0 && i < text.length - 3 ? text.slice(0, i + 1).split(' ').length : Infinity;
  const words = text.split(' ');
  return <>{words.map((w, n) => (
    <span key={n}>{n > 0 && ' '}<span className={`w${n >= nameFrom ? ' name' : ''}`}><span style={{ ['--i' as any]: n }}>{w}</span></span></span>
  ))}</>;
}

export default async function Shell({
  profile, active, title, crumb, action, children, lead
}: {
  profile: Profile; active: string; title: string; crumb?: string;
  action?: React.ReactNode; children: React.ReactNode;
  /* The one thing Home sets large on a phone. Home pages that know better
     pass their own; otherwise unread messages, then the next date that
     matters for this role. */
  lead?: Lead;
}) {
  /* Every signed-in page renders through here, so this is the one place the
     terms gate has to exist. Deep links included: there is no route into the
     account that goes around it.

     Relève's own team is exempt — you do not contract with yourself. */
  if (profile.role !== 'admin' && !(await hasAccepted(profile.id, TERMS_VERSION)))
    return <TermsGate name={profile.full_name} side={profile.role === 'client' ? 'client' : 'talent'} />;

  /* A sign-up who has not yet said which side they are on has no account to
     show: the role they carry is a placeholder. Only /app/welcome asked that
     question, so a deep link to any other page handed them the full talent
     product under their raw e-mail. Same test welcome/page.tsx makes, here,
     so every page under Shell sends them back to answer it first. Anyone
     Relève added by hand already has a side and is never asked. */
  if (profile.role !== 'admin' && active !== '/app/welcome') {
    const self = await getSelfProfile(profile.id);
    /* onboarded_at is the belt to the braces: an account that finished its
       first run before the choice was stamped is never sent back to it. */
    if (!self.role_chosen_at && !self.assigned_by_releve && !self.onboarded_at) redirect('/app/welcome');
  }

  /* Nothing else opens while something asked-for sits unpaid — checked here
     rather than on any one page, so it holds no matter which page under
     /app a client lands on or links to directly. Falls open when Stripe
     itself is not live, the same way the deposit gate does, so an
     unconfigured deploy never locks anyone out over a payment rail that
     does not exist yet. */
  /* Messages and Billing stay open through the gate: the gate's own copy
     says "write to your Client Success Manager rather than paying" a wrong
     invoice, and Messages used to sit behind it. */
  const throughGate = active.startsWith('/app/messages') || active.startsWith('/app/billing');
  if (profile.role === 'client' && stripeReady() && !throughGate) {
    const unpaid = await unpaidInvoiceFor(profile.id);
    if (unpaid) return <InvoiceGate invoiceId={unpaid.id} cents={unpaid.amount_cents}
      number={unpaid.number} failed={unpaid.failed} name={profile.full_name} />;
  }

  const founder = profile.role === 'admin' && await isOwner().catch(() => false);
  const nav = profile.role === 'client'
    ? await clientNav(profile)
    : profile.role === 'talent'
      ? await talentNav(profile)
      : (NAV[profile.role] ?? NAV.talent);
  /* Unread, for the badge on Messages in the sidebar, the drawer and the
     quick bar. Read once here; UnreadSync keeps it current while the page
     stays open. A failure reads as zero, never as an error. */
  const unread = await unreadCount(profile);
  const messagesHref = profile.role === 'admin' ? '/console/messages' : '/app/messages';
  /* The mobile quick bar follows the same stage the sidebar does. */
  const clientStage = profile.role === 'client' ? await executiveStage(profile.id) : null;
  const placedOnly = !!clientStage && clientStage.placed && !clientStage.hiring;
  const clientTour = profile.role === 'client' ? await execInTour(profile.id) : false;
  /* Placed talent get a working-day tab bar (Tasks first), see QuickBar. */
  const talentPlaced = profile.role === 'talent' ? (await listPlacementsFor(profile.id).catch(() => [])).length > 0 : false;
  const home = HOME[profile.role] ?? '/app';
  /* Home on a phone lists every room the four tabs do not reach, so the drawer
     is never the only way to a second screen. */
  const isHome = active === '/app' || active === '/console';
  const tabHrefs = new Set(quickItems(profile.role, clientTour, placedOnly, talentPlaced).map(t => t.href));
  const jump = isHome
    ? nav.flatMap(g => g.items).filter(n => n.href !== home && !tabHrefs.has(n.href)).slice(0, 6)
    : [];
  /* The rooms Home shows as tiles. A room's own screen opens on the same
     material as its tile (phone only), so a tap carries the picture in;
     screens deeper than a room stay type only, so pages alternate. */
  const roomList = [...quickItems(profile.role, clientTour, placedOnly, talentPlaced).filter(t => t.href !== home),
    ...nav.flatMap(g => g.items).filter(n => n.href !== home && !tabHrefs.has(n.href)).slice(0, 6)].slice(0, 8);
  /* Every first-level screen gets its photo: the rooms first (same material
     as their Home tile), then the rest of the menu in order. */
  const levelItems = [...roomList, ...nav.flatMap(g => g.items)]
    .filter((r, i, all) => r.href !== home && all.findIndex(x => x.href === r.href) === i);
  const firstLevel = levelItems.map(r => r.href);
  const roomAt = firstLevel.indexOf(active);
  const profileHref = clientTour ? undefined : PROFILE[profile.role];
  /* Sage, 19 October: the console greets her by name, not the shared inbox. */
  const shownName = profile.role === 'admin' && (!profile.full_name || profile.full_name.includes('@'))
    ? 'Sage' : (profile.full_name ?? 'Your account');
  /* The phone app shell (components/native/NativeShell.tsx) lives in the root
     layout and never leaves; each page hands it what it needs here. In preview
     (3 November 2026): on for owners, on in any browser that opened ?native=1,
     off with ?native=0, on for everyone once NATIVE_ALL=1. */
  let nativePref: string | undefined;
  try { nativePref = (await cookies()).get('rv_native')?.value; } catch { nativePref = undefined; }
  /* 7 November 2026: Nona asked for the phone app to look like the desktop app again. The native
     shell is off for everyone (NATIVE_ALL and the owner default no longer turn it on); ?native=1 still
     opens it in one browser for a look. */
  const nativeOn = nativePref === '1';
  const layout = nativeOn && !isHome ? layoutFor(active) : null;
  const matAt = roomAt >= 0 ? roomAt : [...active].reduce((n, c) => n + c.charCodeAt(0), 0);
  const heroMat = layout ? MATERIALS[matAt % MATERIALS.length] : null;
  const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const todayIdx = new Date(Date.now() - 8 * 3600 * 1000).getUTCDay();
  const nativeCtx = JSON.stringify({
    on: nativeOn, role: profile.role, home, title, isHome, active,
    tabs: quickItems(profile.role, clientTour, placedOnly, talentPlaced),
    groups: withHints(profile.role, nav), who: WHO[profile.role], name: shownName, org: profile.org_name ?? null,
    profileHref, unread, messagesHref, line: horizonLine(profile.role)
  }).replace(/</g, '\\u003c');
  return (
    <>
      <script type="application/json" id="rv-native-ctx" dangerouslySetInnerHTML={{ __html: nativeCtx }} />
      <Motion />
      <PageLift />
      <PullRefresh />
      <BackButton />
      <Flourish />
      <UnreadSync initial={unread} />
      {!configured() && <div className="demo-banner">Preview mode · nothing is saved</div>}
      <MobileNav role={profile.role} active={active} nav={nav}
        who={WHO[profile.role]}
        name={shownName}
        org={profile.org_name}
        profileHref={profileHref} unread={unread} messagesHref={messagesHref} />
      <div className="shell" data-title={isHome ? undefined : title} data-layout={isHome && nativeOn ? 'today' : layout ?? undefined}>
        <aside className="side">
          <Link href={home} className="side-logo"><img src="/logo-white.png" alt="Relève" /></Link>
          {profileHref ? (
            <Link href={profileHref} className="side-role">
              <div className="eyebrow">{WHO[profile.role]}</div>
              <div className="name">{shownName}
                {profile.org_name && <><br /><span className="small" style={{ color: 'var(--pale)' }}>{profile.org_name}</span></>}
              </div>
            </Link>
          ) : (
            <div className="side-role">
              <div className="eyebrow">{WHO[profile.role]}</div>
              <div className="name">{shownName}
                {profile.org_name && <><br /><span className="small" style={{ color: 'var(--pale)' }}>{profile.org_name}</span></>}
              </div>
            </div>
          )}
          <nav className="side-nav">
            {nav.map((g, i) => (
              <div className="nav-group" key={g.group ?? `g${i}`}>
                {g.group && <div className="nav-group-label">{g.group}</div>}
                {g.items.map(n => (
                  <Link key={n.href} href={n.href} className={active === n.href ? 'active' : ''}
                    aria-current={active === n.href ? 'page' : undefined}>
                    {n.label}
                    {n.href === messagesHref && <UnreadBadge initial={unread} variant="side" />}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          {!configured() && <DemoSwitch current={profile.id === 'demo-new' ? 'new' : profile.role} />}
          <form action="/api/signout" method="post" className="side-foot-form">
            <button className="side-foot" type="submit">Sign out</button>
          </form>
        </aside>
        <main className="main">
          <SunWall page />
          <HeaderScroll />
          <div className={`topbar${active === '/app' || active === '/console' ? ' home' : ''}${layout ? ` nv-L nv-L-${layout}` : ''}`}
            style={heroMat ? { ['--hero' as any]: `url(/atmos/tiles/${heroMat}.webp)` } : undefined}>
            <span className="band-light" aria-hidden="true" />
            <div className="tb-text"><div className="crumb">{crumb}</div><h1><Title text={title} /></h1></div>
            {/* Rendered again below, for mobile — see .topbar-action / .mobile-action
                in globals.css. An action like the executive picker on Matching used
                to sit here unconditionally, which put it above the mobile nav bar
                instead of below it: this div lives in .topbar, and .topbar comes
                before .page-body (and the QuickBar inside it) in the DOM no matter
                the screen size. Two renders, toggled by display none/block per
                breakpoint, rather than restructuring the desktop layout to get
                there — action is typically a small client component (a picker, a
                button), and mounting two independent instances of it is cheap. */}
            {action && <div className="topbar-action">{action}</div>}
          </div>
          <div className="page-body">
            {layout === 'gallery' && (() => {
              const n = levelItems.length;
              const from = roomAt >= 0 ? roomAt : 0;
              const next = [1, 2, 3].map(k => levelItems[(from + k) % n]).filter((r, i, all) => r && r.href !== active && all.findIndex(x => x.href === r.href) === i)
                .map(r => ({ href: r.href, label: r.label, mat: MATERIALS[Math.max(0, firstLevel.indexOf(r.href)) % MATERIALS.length] }));
              return <ScreenRail here={{ href: active, label: roomAt >= 0 ? levelItems[roomAt].label : title, mat: heroMat as string }}
                eyebrow={lead?.eyebrow ?? crumb} title={lead?.title ?? title} meta={lead?.meta ?? HINTS[profile.role]?.[active]} next={next} />;
            })()}
            {layout === 'agenda' && (
              <div className="nv-agenda-week" aria-hidden="true">
                {WEEK.map((d, i) => <span key={i} className={i === todayIdx ? 'on' : ''}>{d}</span>)}
              </div>
            )}
            {/* The grace banner, on every client page, so an open invoice is
                seen well before the fourteen-day gate. */}
            {profile.role === 'client' && <BillingBanner clientId={profile.id} />}
            {profile.role !== 'admin' && !clientTour && active === '/app' && (
              <PushSetup compact />
            )}
            {isHome && nativeOn && <HomeStage unreadHref={messagesHref} unread={unread}
              lead={lead ?? defaultLead(profile.role, unread, messagesHref)}
              greeting={title.split(',')[0]} name={firstName(shownName)} askHref={profile.role === 'admin' ? '/console/ask' : '/app/ask'}
              today={new Date(Date.now() - 8 * 3600 * 1000).getUTCDay()}
              rooms={roomList} />}
            {children}
            {isHome && <HomeJump items={jump} unreadHref={messagesHref} unread={unread} />}
            {/* Last in the DOM, first on the screen: both carry order:-2 in the
                phone stylesheet. Putting them after the content means the
                page's first real block is also .page-body's :first-child, which
                is what the desktop rules that lift the opening card over the
                hero band key on; with the (display:none) quick bar sitting in
                that slot, those rules were landing on nothing. */}
            <QuickBar role={profile.role} active={active} placedOnly={placedOnly} talentPlaced={talentPlaced}
              tour={clientTour} unread={unread} />
            {action && <div className="mobile-action">{action}</div>}
          </div>
        </main>
      </div>
      {/* Ask Relève, in the corner of every page except its own full page. */}
      {active !== '/app/ask' && active !== '/console/ask' && (
        <AskWidget who={profile.role} founder={founder} starters={askStarters(profile.role, founder)}
          managerHref={profile.role === 'admin' ? '/console/messages' : '/app/messages'} />
      )}
    </>
  );
}
