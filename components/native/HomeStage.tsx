import Link from 'next/link';
import { Glyph, glyphFor } from './icons';

/* The opening of the phone app, "The Room" (Nona, 3 November 2026: she loves
   Open's look and wants that feel in Relève's colours; deep fern plaster, no
   cards, materials only as imagery, an experience rather than an app).

   Top: the week as seven letters with today underlined; a hairline pill
   carrying the greeting and a question that opens Ask Relève. Then the rooms
   of the account as a row of tall material tiles you swipe through (plaster,
   stone, limewash, the window light), each with its name set on the image.
   The page's own content follows, straight on the wall.

   Today (Nona, 3 November 2026, from two Open screens she sent): under the
   greeting, the one thing that needs this person next, set large, with a
   glowing round button beside it; the rooms as plain words with the first
   lit; one Relève line from the Book's quote cards, changing daily; a short
   status line in spaced capitals; then the material tiles, smaller, under a
   hairline label. A faint silver orbit turns slowly behind the line. Lora for
   titles and spaced capitals, Poppins for running text (Marcellus retired
   3 November 2026). */
export type Lead = {
  eyebrow?: string; title: string; meta?: string; href: string; cta?: string;
  stats?: { n: number | string; k: string }[]; statsLabel?: string; statsHref?: string;
};
type Room = { href: string; label: string; icon?: string };
/* hyper-real nature textures (Nona, 3 November 2026, from her Pinterest references, in Relève's cool palette): silver sculpted wood, grey-green dune, incense on sage plaster, driftwood on grey stucco, palm shadow on sage plaster, silver wood grain.
   Water is a short looping film; the rest breathe with a slow Ken Burns drift. */
const MATERIALS = ['wood', 'dune', 'incense', 'driftwood', 'shadow', 'grain'];
const BY_WORD: [RegExp, string][] = [
  [/task/i, 'tasks'], [/bill|invoice|pay/i, 'card'], [/profile|signature/i, 'person'], [/role|placement|team|watch/i, 'briefcase'],
  [/recruit|directory|people|talent|roster/i, 'people'], [/match|candidate/i, 'person'], [/content|how|resource|skill|brief|log/i, 'book'],
  [/report|business|value|month/i, 'chart'], [/interview|availability|calendar/i, 'calendar'], [/message/i, 'message']
];
const glyph = (r: Room) => {
  const g = glyphFor(r.href, r.icon);
  if (g !== 'home') return g;
  return (BY_WORD.find(([re]) => re.test(r.label) || re.test(r.href)) ?? [null, 'briefcase'])[1] as string;
};
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/* Approved lines from the Book's quote cards (Voice and messaging). The
   CONSIDER IT HANDLED card is left out: those words only ever appear as the
   script image. */
const LINES: [string, string][] = [
  ['Hires rarely fail on skill. They fail on fit.', 'The real risk'],
  ['Six fronts. Before you ever meet them.', 'How we vet'],
  ['The right resume. The wrong working style.', 'The difference'],
  ['We interview many. You meet one.', 'One candidate'],
  ['The point of a hire is less on your plate.', 'Relief, not more work']
];
const dayOfYear = () => {
  const n = new Date(Date.now() - 8 * 3600 * 1000);
  return Math.floor((n.getTime() - Date.UTC(n.getUTCFullYear(), 0, 0)) / 86_400_000);
};

export default function HomeStage({ rooms, unreadHref, unread, greeting, name, askHref, today, lead }: {
  rooms: Room[]; unreadHref: string; unread: number; greeting: string; name: string; askHref: string; today: number; lead: Lead;
}) {
  const [line, source] = LINES[dayOfYear() % LINES.length];
  const words = rooms.slice(0, 5);
  return (
    <div className="nv-stage">
      <div className="nv-week" aria-hidden="true">
        {DAYS.map((d, i) => <span key={i} className={i === today ? 'on' : ''}>{d}</span>)}
      </div>
      <Link href={askHref} className="nv-greet" data-title="Ask Relève">
        <b>{greeting}{name ? `, ${name}` : ''}</b><i aria-hidden="true">·</i><span>What needs you?</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg>
      </Link>

      <section className="nv-lead">
        <div className="nv-lead-text">
          {lead.eyebrow && <p className="nv-lead-eye">{lead.eyebrow}</p>}
          <Link href={lead.href} className="nv-lead-title">{lead.title}</Link>
          {lead.meta && <p className="nv-lead-meta">{lead.meta}</p>}
        </div>
        <Link href={lead.href} className="nv-orb" aria-label={lead.cta ?? lead.title}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h13M12.5 6.5 18 12l-5.5 5.5" /></svg>
        </Link>
      </section>

      <nav className="nv-words" aria-label="Your rooms">
        {words.map((r, i) => (
          <Link key={r.href} href={r.href} className={i === 0 ? 'on' : undefined}>
            {r.label}{r.href === unreadHref && unread > 0 && <sup>{unread}</sup>}
          </Link>
        ))}
      </nav>

      <figure className="nv-line">
        <svg className="nv-orbit" viewBox="0 0 400 400" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth=".6">
            <ellipse cx="200" cy="200" rx="190" ry="150" />
            <ellipse cx="200" cy="200" rx="140" ry="108" />
            <ellipse cx="200" cy="200" rx="88" ry="66" />
          </g>
          <g fill="currentColor">
            <circle cx="390" cy="200" r="1.8" /><circle cx="60" cy="96" r="1.4" /><circle cx="250" cy="349" r="1.4" />
            <circle cx="340" cy="200" r="1.6" /><circle cx="120" cy="290" r="1.2" /><circle cx="288" cy="200" r="1.3" />
            <circle cx="200" cy="200" r="2.6" className="core" />
          </g>
        </svg>
        <blockquote>&ldquo;{line}&rdquo;</blockquote>
        <figcaption>{source}</figcaption>
      </figure>

      {lead.stats && lead.stats.length > 0 && (
        <div className="nv-status">
          <div className="nv-status-head">
            <span>{lead.statsLabel ?? 'Your account'}</span>
            {lead.statsHref && <Link href={lead.statsHref}>View <span aria-hidden="true">&rarr;</span></Link>}
          </div>
          <p>{lead.stats.map(s => <span key={s.k}>{s.n} {s.k}</span>)}</p>
        </div>
      )}

      <div className="nv-sect"><span>Your rooms</span></div>
      <div className="nv-rail" role="list">
        {rooms.map((r, i) => (
          <Link key={r.href} href={r.href} className="nv-room" role="listitem" data-title={r.label}
            style={{ backgroundImage: `url(/atmos/tiles/${MATERIALS[i % MATERIALS.length]}.webp)`, ['--kb' as any]: `${(i % 4) * -3}s` }}>
            <Glyph k={glyph(r)} />
            <span>{r.label}</span>
            {r.href === unreadHref && unread > 0 && <i>{unread}</i>}
          </Link>
        ))}
      </div>
    </div>
  );
}
