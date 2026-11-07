import Link from 'next/link';

/* The other rooms of the app, one tap from Home. The tab bar holds the four
   she reaches for daily; this row holds everything else that the menu holds,
   so a phone never has to open the drawer for the common second screen.
   Phones only (appframe.css hides it on desktop, where the sidebar does it). */
export default function HomeJump({ items, unreadHref, unread }: {
  items: { href: string; label: string }[]; unreadHref?: string; unread?: number;
}) {
  if (!items.length) return null;
  return (
    <nav className="home-jump" aria-label="More pages">
      {items.map(i => (
        <Link key={i.href} href={i.href}>
          {i.label}{i.href === unreadHref && !!unread && <i>{unread > 9 ? '9+' : unread}</i>}
        </Link>
      ))}
    </nav>
  );
}
