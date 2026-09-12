import Link from 'next/link';
import { configured, type Profile } from '@/lib/supabase/server';
import DemoSwitch from './DemoSwitch';
import MobileNav from './MobileNav';
import QuickBar from './QuickBar';
import Motion from './Motion';
import TermsGate from './TermsGate';
import InvoiceGate from './InvoiceGate';
import { hasAccepted, TERMS_VERSION } from '@/lib/money';
import { unpaidInvoiceFor } from '@/lib/billing';
import { stripeReady } from '@/lib/stripe';
import { executiveStage } from '@/lib/stage';
import { listPlacementsFor } from '@/lib/work';
import { firstName } from '@/lib/words';

/* Grouped, not flat. Fifteen undifferentiated links is a filing cabinet;
   four labelled groups is a product. Nothing is removed — everything stays
   reachable — but the eye now lands on a heading first.

   Labels here must match each page's own <Shell title>, or the sidebar and
   the page disagree about what you are looking at. */
type NavItem = { href: string; label: string };
type NavGroup = { group?: string; items: NavItem[] };

const NAV: Record<string, NavGroup[]> = {
  /* The executive menu is built per account by clientNav() below — this entry
     is the shape it starts from, and the fallback if the stage cannot be
     read. */
  client: [
    { items: [{ href: '/app', label: 'Dashboard' }] },
    { group: 'Your brief', items: [
      { href: '/app/signature', label: 'Executive Signature' },
      { href: '/app/role', label: 'The Role' },
      { href: '/app/profile', label: 'Your Profile' }
    ]},
    { group: 'Hiring', items: [
      { href: '/app/pipeline', label: 'Your Candidate' },
      { href: '/app/interviews', label: 'Interviews' },
      { href: '/app/availability', label: 'Availability' }
    ]},
    { group: 'Working together', items: [
      { href: '/app/care', label: 'Your Placement' },
      { href: '/app/tasks', label: 'Tasks' },
      { href: '/app/billing', label: 'Billing' }
    ]},
    { items: [{ href: '/app/messages', label: 'Messages' }] }
  ],

  talent: [
    { items: [{ href: '/app', label: 'Dashboard' }] },
    { group: 'Your profile', items: [
      { href: '/app/signature', label: 'Talent Signature' },
      { href: '/app/skills', label: 'Your Skills' },
      { href: '/app/talent', label: 'Your Profile' },
      { href: '/app/watch', label: 'Taking The Watch' },
      { href: '/app/vetting', label: 'Verification' }
    ]},
    { group: 'Opportunities', items: [
      { href: '/app/interviews', label: 'Interviews' },
      { href: '/app/availability', label: 'Availability' }
    ]},
    { group: 'Your placement', items: [
      { href: '/app/care', label: 'Your Placement' },
      { href: '/app/tasks', label: 'Tasks' },
      { href: '/app/checkin', label: 'Weekly Check-in' },
      { href: '/app/pay', label: 'Your Pay' }
    ]},
    { items: [{ href: '/app/messages', label: 'Messages' }] }
  ],

  admin: [
    { items: [
      { href: '/console', label: 'Overview' },
      { href: '/console/calendar', label: 'Calendar' }
    ] },
    { group: 'Directory', items: [
      { href: '/console/people', label: 'Executives' },
      { href: '/console/bench', label: 'Talent' },
      { href: '/console/vetting', label: 'Verification' },
      { href: '/console/watch', label: 'Taking The Watch' }
    ]},
    { group: 'Recruiting', items: [
      { href: '/console/postings', label: 'Postings' },
      { href: '/console/applications', label: 'Applications' }
    ]},
    { group: 'Placing', items: [
      { href: '/console/matching', label: 'Matching' },
      { href: '/console/interviews', label: 'Interviews' },
      { href: '/console/offers', label: 'Offers' }
    ]},
    { group: 'Running', items: [
      { href: '/console/placements', label: 'Placements' },
      { href: '/console/care', label: 'Care' },
      { href: '/console/checkins', label: 'Check-ins' },
      { href: '/console/money', label: 'Billing' }
    ]},
    { group: 'The business', items: [
      { href: '/console/reports', label: 'Reports' },
      { href: '/console/signals', label: 'Match Accuracy' },
      { href: '/console/team', label: 'Team' },
      { href: '/console/messages', label: 'Messages' }
    ]}
  ]
};

const WHO: Record<string, string> = { client: 'Executive Account', talent: 'Talent Account', admin: 'Relève Console' };

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
  const nav: NavGroup[] = [{ items: [{ href: '/app', label: 'Dashboard' }] }];

  const brief: NavItem[] = [{ href: '/app/signature', label: 'Executive Signature' }];
  /* The role brief describes a search. With none open it is a document about
     something finished, so it goes with the hiring screens rather than
     sitting in the menu inviting edits nobody will read. */
  if (stage.hiring) brief.push({ href: '/app/role', label: 'The Role' });
  brief.push({ href: '/app/profile', label: 'Your Profile' });
  nav.push({ group: 'Your brief', items: brief });

  if (stage.hiring) {
    nav.push({ group: 'Hiring', items: [
      { href: '/app/pipeline', label: 'Your Candidate' },
      { href: '/app/interviews', label: 'Interviews' },
      { href: '/app/availability', label: 'Availability' }
    ]});
  }

  if (stage.placed) {
    const placements = await listPlacementsFor(profile.id);
    const items: NavItem[] = placements.length > 1
      ? placements.map(p => ({ href: `/app/care/${p.id}`, label: firstName(p.talent_name) }))
      : [{ href: '/app/care', label: 'Your Placement' }];
    nav.push({
      group: placements.length > 1 ? 'Your team' : 'Working together',
      items: [...items,
        { href: '/app/tasks', label: 'Tasks' },
        { href: '/app/billing', label: 'Billing' }]
    });
  } else {
    /* Billing exists from the deposit onward, so it cannot wait for a
       placement — an executive who has paid to open a search must be able to
       see what they paid. */
    nav.push({ group: 'Working together', items: [{ href: '/app/billing', label: 'Billing' }] });
  }

  nav.push({ items: [{ href: '/app/messages', label: 'Messages' }] });
  return nav;
}

export default async function Shell({
  profile, active, title, crumb, action, children
}: {
  profile: Profile; active: string; title: string; crumb?: string;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  /* Every signed-in page renders through here, so this is the one place the
     terms gate has to exist. Deep links included: there is no route into the
     account that goes around it.

     Relève's own team is exempt — you do not contract with yourself. */
  if (profile.role !== 'admin' && !(await hasAccepted(profile.id, TERMS_VERSION)))
    return <TermsGate name={profile.full_name} side={profile.role === 'client' ? 'client' : 'talent'} />;

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

  const nav = profile.role === 'client'
    ? await clientNav(profile)
    : (NAV[profile.role] ?? NAV.talent);
  /* The mobile quick bar follows the same stage the sidebar does. */
  const clientStage = profile.role === 'client' ? await executiveStage(profile.id) : null;
  const placedOnly = !!clientStage && clientStage.placed && !clientStage.hiring;
  const home = HOME[profile.role] ?? '/app';
  const profileHref = PROFILE[profile.role];
  return (
    <>
      <Motion />
      {!configured() && <div className="demo-banner">Preview mode · nothing is saved</div>}
      <MobileNav role={profile.role} active={active} nav={nav}
        who={WHO[profile.role]}
        name={profile.full_name ?? profile.email}
        org={profile.org_name}
        profileHref={profileHref} />
      <div className="shell">
        <aside className="side">
          <Link href={home} className="side-logo"><img src="/logo-white.png" alt="Relève" /></Link>
          {profileHref ? (
            <Link href={profileHref} className="side-role">
              <div className="eyebrow">{WHO[profile.role]}</div>
              <div className="name">{profile.full_name ?? profile.email}
                {profile.org_name && <><br /><span className="small" style={{ color: '#93A394' }}>{profile.org_name}</span></>}
              </div>
            </Link>
          ) : (
            <div className="side-role">
              <div className="eyebrow">{WHO[profile.role]}</div>
              <div className="name">{profile.full_name ?? profile.email}
                {profile.org_name && <><br /><span className="small" style={{ color: '#93A394' }}>{profile.org_name}</span></>}
              </div>
            </div>
          )}
          <nav className="side-nav">
            {nav.map((g, i) => (
              <div className="nav-group" key={g.group ?? `g${i}`}>
                {g.group && <div className="nav-group-label">{g.group}</div>}
                {g.items.map(n => (
                  <Link key={n.href} href={n.href} className={active === n.href ? 'active' : ''}>
                    {n.label}
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
          <div className="topbar">
            <div><div className="crumb">{crumb}</div><h1>{title}</h1></div>
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
            <QuickBar role={profile.role} active={active} placedOnly={placedOnly} />
            {action && <div className="mobile-action">{action}</div>}
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
