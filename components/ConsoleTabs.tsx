import Link from 'next/link';
import type { ReactNode } from 'react';

export type TabItem = { href: string; label: string; count?: number };

/* One strip, used by Directory, Recruiting and Matching (25 October 2026).
   Each of those was several sidebar entries for one job; they are tabs now,
   so the job has one place and the steps inside it are visible without
   hunting the menu for what comes next. A count appears only when there is
   something in it, so an empty step never shouts. */
export default function ConsoleTabs({ items, active, aside }: {
  items: TabItem[]; active: string; aside?: ReactNode;
}) {
  return (
    <div className="dir-head">
      <nav className="tabs" aria-label="Sections">
        {items.map(t => (
          <Link key={t.href} href={t.href}
            className={active === t.href ? 'on' : ''}
            aria-current={active === t.href ? 'page' : undefined}>
            {t.label}
            {t.count ? <span className="tab-n">{t.count}</span> : null}
          </Link>
        ))}
      </nav>
      {aside ? <div className="dir-aside">{aside}</div> : null}
    </div>
  );
}
