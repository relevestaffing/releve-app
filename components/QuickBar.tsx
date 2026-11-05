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
  /* Talent on the roster, not yet placed: getting ready and interviewing. */
  talent: [
    { href: '/app',            label: 'Home',       icon: 'home' },
    { href: '/app/interviews', label: 'Interviews', icon: 'calendar' },
    { href: '/app/messages',   label: 'Messages',   icon: 'message' },
    { href: '/app/talent',     label: 'Profile',    icon: 'person' }
  ],
  /* Messages has its own badge in the topbar on every screen, so the four
     thumb-sized tabs go to the four she opens on a phone. */
  /* 4 November 2026 (Nona: the console "feels a little bit confusing... I
     have to search for stuff"): Messages is a tab, not hidden under More;
     Billing, run once a month, moves into More. */
  admin: [
    { href: '/console',            label: 'Today',      icon: 'home' },
    { href: '/console/directory',  label: 'Directory',  icon: 'people' },
    { href: '/console/messages',   label: 'Messages',   icon: 'message' },
    { href: '/console/placements', label: 'Placements', icon: 'briefcase' }
  ]
};

/* Once an executive is placed and no search is open, the sidebar drops the
   hiring screens — the quick bar has to follow it, or the phone keeps a
   "Candidate" tab pointing at a search that is over. */
const CLIENT_PLACED = [
  { href: '/app',          label: 'Home',       icon: 'home' },
  { href: '/app/tasks',    label: 'Tasks',      icon: 'tasks' },
  { href: '/app/messages', label: 'Messages',   icon: 'message' },
  { href: '/app/care',     label: 'Placement',  icon: 'briefcase' }
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

/* Placed talent live in their tasks, so the bar follows the working day
   (4 November 2026): Home, Tasks, Messages, Placement. */
const TALENT_PLACED = [
  { href: '/app',          label: 'Home',      icon: 'home' },
  { href: '/app/tasks',    label: 'Tasks',     icon: 'tasks' },
  { href: '/app/messages', label: 'Messages',  icon: 'message' },
  { href: '/app/care',     label: 'Placement', icon: 'briefcase' }
];
/* The four tabs a role has right now. Shared with Home, which lists the rest. */
export function quickItems(role: string, tour: boolean, placedOnly: boolean, talentPlaced = false) {
  if (role === 'client') return tour ? CLIENT_TOUR : placedOnly ? CLIENT_PLACED : PRIMARY.client;
  if (role === 'talent') return talentPlaced ? TALENT_PLACED : PRIMARY.talent;
  return PRIMARY[role] ?? PRIMARY.talent;
}

export default function QuickBar({ role, active, placedOnly = false, tour = false, unread = 0, talentPlaced = false }: {
  role: string; active: string; unread?: number; talentPlaced?: boolean;
  /* true for an executive with a placement and no open search */
  placedOnly?: boolean;
  /* true for an executive who has not taken the deposit step yet */
  tour?: boolean;
}) {
  const items = quickItems(role, tour, placedOnly, talentPlaced);
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
