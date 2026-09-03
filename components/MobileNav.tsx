'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type NavItem = { href: string; label: string };
type NavGroup = { group?: string; items: NavItem[] };

/* Line icons at a single 1.25px stroke. Restrained on purpose — a luxury
   product does not want clip art at the bottom of the screen. */
const ICONS: Record<string, React.ReactNode> = {
  home:      <><path d="M3 9.5 10 4l7 5.5" /><path d="M5 9v7h10V9" /></>,
  people:    <><circle cx="7.5" cy="7" r="2.6" /><path d="M3 16c0-2.5 2-4.2 4.5-4.2S12 13.5 12 16" /><path d="M13.5 5.6a2.6 2.6 0 0 1 0 5" /><path d="M14 11.9c1.8.4 3 1.9 3 4.1" /></>,
  calendar:  <><rect x="3" y="5" width="14" height="12" rx="1.4" /><path d="M3 8.6h14M7 3.5v3M13 3.5v3" /></>,
  message:   <><path d="M3.5 5.5h13v9h-7l-4 3v-3h-2z" /></>,
  briefcase: <><rect x="3" y="6.5" width="14" height="10" rx="1.4" /><path d="M7.5 6.5V4.6h5v1.9M3 10.5h14" /></>,
  spark:     <><path d="M10 3v14M3 10h14" /><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" opacity=".45" /></>,
  chart:     <><path d="M3.5 16.5V9M8 16.5V4.5M12.5 16.5v-5M17 16.5V7.5" /></>,
  more:      <><circle cx="4.5" cy="10" r="1.15" /><circle cx="10" cy="10" r="1.15" /><circle cx="15.5" cy="10" r="1.15" /></>
};

const Icon = ({ k }: { k: string }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[k]}
  </svg>
);

/* The four destinations each role reaches for constantly. Everything else is
   one tap away behind Menu — which is the whole point of a bottom bar. */
const PRIMARY: Record<string, { href: string; label: string; icon: string }[]> = {
  client: [
    { href: '/app',            label: 'Home',       icon: 'home' },
    { href: '/app/pipeline',   label: 'Matches',    icon: 'people' },
    { href: '/app/interviews', label: 'Interviews', icon: 'calendar' },
    { href: '/app/messages',   label: 'Messages',   icon: 'message' }
  ],
  talent: [
    { href: '/app',            label: 'Home',       icon: 'home' },
    { href: '/app/interviews', label: 'Interviews', icon: 'calendar' },
    { href: '/app/care',       label: 'Placement',  icon: 'briefcase' },
    { href: '/app/messages',   label: 'Messages',   icon: 'message' }
  ],
  admin: [
    { href: '/console',            label: 'Overview',   icon: 'home' },
    { href: '/console/matching',   label: 'Matching',   icon: 'spark' },
    { href: '/console/placements', label: 'Placements', icon: 'briefcase' },
    { href: '/console/reports',    label: 'Reports',    icon: 'chart' }
  ]
};

export default function MobileNav({ role, active, nav, who, name, org }: {
  role: string; active: string; nav: NavGroup[];
  who: string; name: string; org?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const primary = PRIMARY[role] ?? PRIMARY.talent;

  /* A sheet that leaves the page scrolling behind it feels broken. */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  /* Close on Escape, and on a back gesture. */
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <>
      <nav className="tabbar" aria-label="Main">
        {primary.map(p => (
          <Link key={p.href} href={p.href}
            className={active === p.href ? 'on' : ''}
            aria-current={active === p.href ? 'page' : undefined}>
            <Icon k={p.icon} />
            <span>{p.label}</span>
          </Link>
        ))}
        <button type="button" className={open ? 'on' : ''}
          onClick={() => setOpen(true)} aria-expanded={open} aria-label="More">
          <Icon k="more" />
          <span>Menu</span>
        </button>
      </nav>

      {open && (
        <div className="sheet-scrim" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Menu"
            onClick={e => e.stopPropagation()}>
            <div className="sheet-grip" />

            <div className="sheet-who">
              <div className="eyebrow">{who}</div>
              <div className="sheet-name">{name}</div>
              {org && <div className="xs">{org}</div>}
            </div>

            <div className="sheet-scroll">
              {nav.map((g, i) => (
                <div className="sheet-group" key={g.group ?? `g${i}`}>
                  {g.group && <div className="sheet-group-label">{g.group}</div>}
                  {g.items.map(n => (
                    <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                      className={active === n.href ? 'on' : ''}>
                      {n.label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>

            <form action="/api/signout" method="post" className="sheet-out">
              <button type="submit">Sign out</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
