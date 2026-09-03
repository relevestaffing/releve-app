import Link from 'next/link';
import { configured, type Profile } from '@/lib/supabase/server';
import DemoSwitch from './DemoSwitch';
import MobileNav from './MobileNav';
import TermsGate from './TermsGate';
import { hasAccepted, TERMS_VERSION } from '@/lib/money';

/* Grouped, not flat. Fifteen undifferentiated links is a filing cabinet;
   four labelled groups is a product. Nothing is removed — everything stays
   reachable — but the eye now lands on a heading first.

   Labels here must match each page's own <Shell title>, or the sidebar and
   the page disagree about what you are looking at. */
type NavItem = { href: string; label: string };
type NavGroup = { group?: string; items: NavItem[] };

const NAV: Record<string, NavGroup[]> = {
  client: [
    { items: [{ href: '/app', label: 'Dashboard' }] },
    { group: 'Your brief', items: [
      { href: '/app/signature', label: 'Executive Signature' },
      { href: '/app/role', label: 'The Role' },
      { href: '/app/profile', label: 'Your Profile' }
    ]},
    { group: 'Hiring', items: [
      { href: '/app/pipeline', label: 'Your Matches' },
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
      { href: '/app/vetting', label: 'Verification' }
    ]},
    { group: 'Opportunities', items: [
      { href: '/app/interviews', label: 'Interviews' },
      { href: '/app/availability', label: 'Availability' }
    ]},
    { group: 'Your placement', items: [
      { href: '/app/care', label: 'Your Placement' },
      { href: '/app/tasks', label: 'Tasks' },
      { href: '/app/checkin', label: 'Weekly Check-in' }
    ]},
    { items: [{ href: '/app/messages', label: 'Messages' }] }
  ],

  admin: [
    { items: [{ href: '/console', label: 'Overview' }] },
    { group: 'People', items: [
      { href: '/console/people', label: 'Executives' },
      { href: '/console/bench', label: 'Talent Bench' },
      { href: '/console/vetting', label: 'Verification' }
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
      { href: '/console/signals', label: 'Calibration' },
      { href: '/console/team', label: 'Team' },
      { href: '/console/messages', label: 'Messages' }
    ]}
  ]
};

const WHO: Record<string, string> = { client: 'Executive Account', talent: 'Talent Account', admin: 'Relève Console' };

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
    return <TermsGate name={profile.full_name} />;

  const nav = NAV[profile.role] ?? NAV.talent;
  return (
    <>
      {!configured() && <div className="demo-banner">Preview mode · nothing is saved</div>}
      <MobileNav role={profile.role} active={active} nav={nav}
        who={WHO[profile.role]}
        name={profile.full_name ?? profile.email}
        org={profile.org_name} />
      <div className="shell">
        <aside className="side">
          <div className="side-logo"><img src="/logo-white.png" alt="Relève" /></div>
          <div className="side-role">
            <div className="eyebrow">{WHO[profile.role]}</div>
            <div className="name">{profile.full_name ?? profile.email}
              {profile.org_name && <><br /><span className="small" style={{ color: '#93A394' }}>{profile.org_name}</span></>}
            </div>
          </div>
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
            <div>{action}</div>
          </div>
          <div className="page-body anim">{children}</div>
        </main>
      </div>
    </>
  );
}
