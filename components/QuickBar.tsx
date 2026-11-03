import Link from 'next/link';
import UnreadBadge from './UnreadBadge';

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
  /* Messages has its own badge in the topbar on every screen, so the four
     thumb-sized tabs go to the four she opens on a phone. */
  admin: [
    { href: '/console',            label: 'Overview',   icon: 'home' },
    { href: '/console/directory',  label: 'Directory',  icon: 'people' },
    { href: '/console/placements', label: 'Placed',     icon: 'briefcase' },
    { href: '/console/money',      label: 'Billing',    icon: 'chart' }
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

/* An executive before the deposit sees the three vision screens and nothing
   else in the sidebar. The quick bar has to agree with it: it was still
   offering Candidate, which at that stage redirects to the Signature — a
   screen the menu is deliberately holding back, reached by tapping a tab
   that appears to go somewhere else. */
const CLIENT_TOUR = [
  { href: '/app',          label: 'Home',      icon: 'home' },
  { href: '/app/how',      label: 'How it works', icon: 'book' },
  { href: '/app/value',    label: 'The value', icon: 'chart' },
  { href: '/app/messages', label: 'Messages',  icon: 'message' }
];

export default function QuickBar({ role, active, placedOnly = false, tour = false, unread = 0 }: {
  role: string; active: string; unread?: number;
  /* true for an executive with a placement and no open search */
  placedOnly?: boolean;
  /* true for an executive who has not taken the deposit step yet */
  tour?: boolean;
}) {
  const items = role === 'client'
    ? (tour ? CLIENT_TOUR : placedOnly ? CLIENT_PLACED : PRIMARY.client)
    : (PRIMARY[role] ?? PRIMARY.talent);
  return (
    <nav className="quickbar" aria-label="Quick actions">
      {items.map(p => (
        <Link key={p.href} href={p.href} className={active === p.href ? 'on' : ''}
          aria-current={active === p.href ? 'page' : undefined}>
          <span>{p.label}</span>
          {p.icon === 'message' && <UnreadBadge initial={unread} variant="quick" />}
        </Link>
      ))}
    </nav>
  );
}
