import Link from 'next/link';
import { configured, type Profile } from '@/lib/supabase/server';
import DemoSwitch from './DemoSwitch';
import TermsGate from './TermsGate';
import { hasAccepted, TERMS_VERSION } from '@/lib/money';

const NAV: Record<string, { href: string; label: string }[]> = {
  client: [
    { href: '/app', label: 'Dashboard' },
    { href: '/app/signature', label: 'Executive Signature' },
    { href: '/app/role', label: 'The Role' },
    { href: '/app/profile', label: 'My Profile' },
    { href: '/app/pipeline', label: 'Your Matches' },
    { href: '/app/tasks', label: 'Tasks' },
    { href: '/app/interviews', label: 'Interviews' },
    { href: '/app/availability', label: 'Availability' },
    { href: '/app/care', label: 'Your Placement' },
    { href: '/app/billing', label: 'Billing' },
    { href: '/app/messages', label: 'Messages' }
  ],
  talent: [
    { href: '/app', label: 'Dashboard' },
    { href: '/app/signature', label: 'Talent Signature' },
    { href: '/app/skills', label: 'Your Skills' },
    { href: '/app/talent', label: 'My Profile' },
    { href: '/app/vetting', label: 'Verification' },
    { href: '/app/tasks', label: 'Tasks' },
    { href: '/app/checkin', label: 'Weekly check-in' },
    { href: '/app/care', label: 'Your Placement' },
    { href: '/app/interviews', label: 'Interviews' },
    { href: '/app/availability', label: 'Availability' },
    { href: '/app/messages', label: 'Messages' }
  ],
  admin: [
    { href: '/console', label: 'Overview' },
    { href: '/console/people', label: 'Clients' },
    { href: '/console/bench', label: 'Talent Bench' },
    { href: '/console/vetting', label: 'Verification' },
    { href: '/console/matching', label: 'Matching Engine' },
    { href: '/console/interviews', label: 'Interviews' },
    { href: '/console/offers', label: 'Offers' },
    { href: '/console/placements', label: 'Placements' },
    { href: '/console/money', label: 'Money' },
    { href: '/console/care', label: 'Care' },
    { href: '/console/reports', label: 'Reports' },
    { href: '/console/team', label: 'Team' },
    { href: '/console/checkins', label: 'Check-ins' },
    { href: '/console/signals', label: 'What we learn' },
    { href: '/console/messages', label: 'Messages' }
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
      {!configured() && <div className="demo-banner">Demo mode · Supabase not connected · nothing is saved</div>}
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
            {nav.map(n => (
              <Link key={n.href} href={n.href} className={active === n.href ? 'active' : ''}>{n.label}</Link>
            ))}
          </nav>
          {!configured() && <DemoSwitch current={profile.id === 'demo-new' ? 'new' : profile.role} />}
          <form action="/api/signout" method="post"><button className="side-foot" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>← Sign out</button></form>
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
