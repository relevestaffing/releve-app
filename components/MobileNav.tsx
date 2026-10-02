'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import UnreadBadge from './UnreadBadge';

type NavItem = { href: string; label: string };
type NavGroup = { group?: string; items: NavItem[] };

/* Line icons at a single 1.25px stroke. Restrained on purpose — a luxury
   product does not want clip art in its chrome. */
const ICONS: Record<string, React.ReactNode> = {
  menu:  <><path d="M3.5 6h13M3.5 10h13M3.5 14h13" /></>,
  close: <><path d="M5 5l10 10M15 5L5 15" /></>
};

const Icon = ({ k }: { k: string }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[k]}
  </svg>
);

/* The bottom tab bar is gone. In its place: a menu trigger that lives in the
   header — which is already sticky, so it is reachable no matter how far
   down the page you have scrolled — opening a drawer that is the same
   sidebar desktop uses, sliding in from the left instead of sitting fixed
   beside the content. Same nav-group markup, same classes, same fern —
   so this never drifts out of sync with the desktop sidebar's own look. */
export default function MobileNav({ role, active, nav, who, name, org, profileHref, unread = 0, messagesHref }: {
  role: string; active: string; nav: NavGroup[];
  who: string; name: string; org?: string | null; profileHref?: string;
  unread?: number; messagesHref?: string;
}) {
  const [open, setOpen] = useState(false);

  /* A drawer that leaves the page scrolling behind it feels broken. */
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
      <button type="button" className="menu-trigger" onClick={() => setOpen(true)}
        aria-expanded={open} aria-label="Open menu">
        <Icon k="menu" />
        <UnreadBadge initial={unread} variant="dot" />
      </button>

      {open && (
        <div className="nav-drawer-scrim" onClick={() => setOpen(false)}>
          <aside className="nav-drawer" role="dialog" aria-modal="true" aria-label="Menu"
            onClick={e => e.stopPropagation()}>
            <button type="button" className="nav-drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">
              <Icon k="close" />
            </button>

            {profileHref ? (
              <Link href={profileHref} onClick={() => setOpen(false)} className="side-role">
                <div className="eyebrow">{who}</div>
                <div className="name">{name}
                  {org && <><br /><span className="small" style={{ color: 'var(--pale)' }}>{org}</span></>}
                </div>
              </Link>
            ) : (
              <div className="side-role">
                <div className="eyebrow">{who}</div>
                <div className="name">{name}
                  {org && <><br /><span className="small" style={{ color: 'var(--pale)' }}>{org}</span></>}
                </div>
              </div>
            )}

            <nav className="side-nav">
              {nav.map((g, i) => (
                <div className="nav-group" key={g.group ?? `g${i}`}>
                  {g.group && <div className="nav-group-label">{g.group}</div>}
                  {g.items.map(n => (
                    <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                      className={active === n.href ? 'active' : ''}
                      aria-current={active === n.href ? 'page' : undefined}>
                      {n.label}
                      {n.href === messagesHref && <UnreadBadge initial={unread} variant="side" />}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>

            <form action="/api/signout" method="post" className="side-foot-form">
              <button className="side-foot" type="submit">Sign out</button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
