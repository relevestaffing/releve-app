import Link from 'next/link';
import { Glyph, glyphFor } from './icons';

/* The opening of the phone app (Nona, 3 November 2026: a full remodel, in
   Relève's branding). Home opens on the wall with the greeting, the tagline in
   its own script, and the rooms of the account as a row of panels you swipe
   through, each rising out of the wall. The page's own content follows. */
type Room = { href: string; label: string; icon?: string };

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

export default function HomeStage({ rooms, unreadHref, unread }: { rooms: Room[]; unreadHref: string; unread: number }) {
  return (
    <div className="nv-stage">
      <img className="nv-tag" src="/consider-it-handled-cream.png" alt="Consider it handled." />
      <div className="nv-rail" role="list">
        {rooms.map(r => (
          <Link key={r.href} href={r.href} className="nv-room" role="listitem" data-title={r.label}>
            <Glyph k={glyph(r)} />
            <span>{r.label}</span>
            {r.href === unreadHref && unread > 0 && <i>{unread}</i>}
          </Link>
        ))}
      </div>
    </div>
  );
}
