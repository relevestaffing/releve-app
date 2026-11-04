import Link from 'next/link';
import { Glyph, glyphFor } from './icons';

/* The opening of the phone app, "The Room" (Nona, 3 November 2026: she loves
   Open's look and wants that feel in Relève's colours; deep fern plaster, no
   cards, materials only as imagery, an experience rather than an app).

   Top: the week as seven letters with today underlined; a hairline pill
   carrying the greeting and a question that opens Ask Relève. Then the rooms
   of the account as a row of tall material tiles you swipe through (plaster,
   stone, limewash, the window light), each with its name set on the image.
   The page's own content follows, straight on the wall. */
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

export default function HomeStage({ rooms, unreadHref, unread, greeting, name, askHref, today }: {
  rooms: Room[]; unreadHref: string; unread: number; greeting: string; name: string; askHref: string; today: number;
}) {
  return (
    <div className="nv-stage">
      <div className="nv-week" aria-hidden="true">
        {DAYS.map((d, i) => <span key={i} className={i === today ? 'on' : ''}>{d}</span>)}
      </div>
      <Link href={askHref} className="nv-greet" data-title="Ask Relève">
        <b>{greeting}{name ? `, ${name}` : ''}</b><i aria-hidden="true">·</i><span>What needs you?</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg>
      </Link>
      <div className="nv-rail" role="list">
        {rooms.map((r, i) => (
          <Link key={r.href} href={r.href} className="nv-room" role="listitem" data-title={r.label}
            style={{ backgroundImage: `url(/atmos/tiles/${MATERIALS[i % MATERIALS.length]}.webp)`, ['--kb' as any]: `${(i % 4) * -3}s` }}>
            {MATERIALS[i % MATERIALS.length] === 'water' && (
              <video className="nv-film" src="/atmos/tiles/water.mp4" poster="/atmos/tiles/water.webp" autoPlay muted loop playsInline aria-hidden="true" />
            )}
            <Glyph k={glyph(r)} />
            <span>{r.label}</span>
            {r.href === unreadHref && unread > 0 && <i>{unread}</i>}
          </Link>
        ))}
      </div>
    </div>
  );
}
