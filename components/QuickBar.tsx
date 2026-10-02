import Link from 'next/link';
import UnreadBadge from './UnreadBadge';

/* Line icons at a single 1.25px stroke, matching MobileNav's. */
const ICONS: Record<string, React.ReactNode> = {
  home:      <><path d="M3 9.5 10 4l7 5.5" /><path d="M5 9v7h10V9" /></>,
  people:    <><circle cx="7.5" cy="7" r="2.6" /><path d="M3 16c0-2.5 2-4.2 4.5-4.2S12 13.5 12 16" /><path d="M13.5 5.6a2.6 2.6 0 0 1 0 5" /><path d="M14 11.9c1.8.4 3 1.9 3 4.1" /></>,
  calendar:  <><rect x="3" y="5" width="14" height="12" rx="1.4" /><path d="M3 8.6h14M7 3.5v3M13 3.5v3" /></>,
  message:   <><path d="M3.5 5.5h13v9h-7l-4 3v-3h-2z" /></>,
  briefcase: <><rect x="3" y="6.5" width="14" height="10" rx="1.4" /><path d="M7.5 6.5V4.6h5v1.9M3 10.5h14" /></>,
  chart:     <><path d="M3.5 16.5V9M8 16.5V4.5M12.5 16.5v-5M17 16.5V7.5" /></>
};

const Icon = ({ k }: { k: string }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[k]}
  </svg>
);

/* The four destinations each role reaches for constantly — what the bottom
   tab bar used to anchor. Rendered here instead as the first thing inside
   the scrolling page body, position:sticky with a top offset matching the
   header's height, so it scrolls with the page for the first beat and then
   locks in place directly under the header — reachable and interactive no
   matter how far down the dashboard you have scrolled, the same way the
   desktop sidebar never leaves. Desktop hides this entirely; the real
   sidebar already does this job there. */
const PRIMARY: Record<string, { href: string; label: string; icon: string }[]> = {
  client: [
    { href: '/app',            label: 'Home',       icon: 'home' },
    { href: '/app/pipeline',   label: 'Candidate',  icon: 'people' },
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
    { href: '/console/money',      label: 'Billing',    icon: 'chart' },
    { href: '/console/placements', label: 'Placed',     icon: 'briefcase' },
    { href: '/console/messages',   label: 'Messages',   icon: 'message' }
  ]
};

/* Once an executive is placed and no search is open, the sidebar drops the
   hiring screens — the quick bar has to follow it, or the phone keeps a
   "Candidate" tab pointing at a search that is over. */
const CLIENT_PLACED = [
  { href: '/app',          label: 'Home',       icon: 'home' },
  { href: '/app/care',     label: 'Placement',  icon: 'briefcase' },
  { href: '/app/tasks',    label: 'Tasks',      icon: 'people' },
  { href: '/app/messages', label: 'Messages',   icon: 'message' }
];

export default function QuickBar({ role, active, placedOnly = false, unread = 0 }: {
  role: string; active: string; unread?: number;
  /* true for an executive with a placement and no open search */
  placedOnly?: boolean;
}) {
  const items = role === 'client' && placedOnly ? CLIENT_PLACED : (PRIMARY[role] ?? PRIMARY.talent);
  return (
    <nav className="quickbar" aria-label="Quick actions">
      {items.map(p => (
        <Link key={p.href} href={p.href} className={active === p.href ? 'on' : ''}
          aria-current={active === p.href ? 'page' : undefined}>
          <Icon k={p.icon} />
          <span>{p.label}</span>
          {p.icon === 'message' && <UnreadBadge initial={unread} variant="quick" />}
        </Link>
      ))}
    </nav>
  );
}
