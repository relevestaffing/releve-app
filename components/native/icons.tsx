/* The dock's own marks. Thin custom icons are allowed in the tab bar only (Nona, 3 November 2026). */
const G: Record<string, React.ReactNode> = {
  /* Redrawn 10 November 2026 (Nona: the first set "felt template"). Every mark now comes from
     Relève's own world rather than a stock set: the arched doorway and the arched portrait frame
     from the website, the paned window from the wall, the stack of cards from Home, a note with a
     seal, two rings for a pairing, a colonnade for the directory, the sprig for More. One hand:
     a 24 px grid, a fine 1.1 stroke, round ends, and a quiet fill (.f) on the tab you are on. */
  home: <><path className="f" d="M6 20V11a6 6 0 0 1 12 0v9z" /><path d="M6 20V11a6 6 0 0 1 12 0v9M9.75 20v-8.25a2.25 2.25 0 0 1 4.5 0V20M3.5 20h17" /></>,
  person: <><path className="f" d="M6.5 20.5V10.5a5.5 5.5 0 0 1 11 0v10z" /><path d="M6.5 20.5V10.5a5.5 5.5 0 0 1 11 0v10z" /><circle cx="12" cy="11.2" r="2.1" /><path d="M8.7 18.7c.5-2.2 1.7-3.3 3.3-3.3s2.8 1.1 3.3 3.3" /></>,
  people: <><path className="f" d="M9.5 19.5V9.75a2.5 2.5 0 0 1 5 0v9.75z" /><path d="M4 19.5v-6a2.5 2.5 0 0 1 5 0M9.5 19.5V9.75a2.5 2.5 0 0 1 5 0v9.75M15 13.5a2.5 2.5 0 0 1 5 0v6M3 19.5h18" /></>,
  calendar: <><rect className="f" x="5" y="4.5" width="14" height="15" rx="1.5" /><rect x="5" y="4.5" width="14" height="15" rx="1.5" /><path d="M12 4.5v15M5 12h14" /></>,
  message: <><rect className="f" x="4" y="5.5" width="16" height="13" rx="2.25" /><rect x="4" y="5.5" width="16" height="13" rx="2.25" /><path d="M7.5 10h5M7.5 13.75h9" /><circle cx="16.4" cy="9.6" r="1.15" fill="currentColor" stroke="none" /></>,
  briefcase: <><circle className="f" cx="9.5" cy="12" r="5" /><circle cx="9.5" cy="12" r="5" /><circle cx="14.5" cy="12" r="5" /></>,
  tasks: <><rect className="f" x="4.5" y="10" width="15" height="10" rx="2.5" /><path d="M8 4.75h8M6.25 7.4h11.5" /><rect x="4.5" y="10" width="15" height="10" rx="2.5" /><path d="M9 15l2.1 2.1 4-4.3" /></>,
  card: <><rect className="f" x="3.5" y="6" width="17" height="12" rx="2.25" /><rect x="3.5" y="6" width="17" height="12" rx="2.25" /><path d="M3.5 10h17M7 14.5h3.5" /></>,
  book: <><path d="M12 7C10.1 5.6 7.6 5.1 4.5 5.6v12.5c3.1-.5 5.6 0 7.5 1.4 1.9-1.4 4.4-1.9 7.5-1.4V5.6C16.4 5.1 13.9 5.6 12 7zM12 7v12.5" /></>,
  chart: <><path d="M4 19.75h16M7 16.5v-4M12 16.5V8M17 16.5V5.25" /></>,
  more: <><path d="M5.5 19c4.5-1.6 9-6 12.5-13" /><path className="f" d="M9.6 16.3c-.6-2.6.5-4.5 3.1-5.1.5 2.6-.6 4.5-3.1 5.1z" /><path d="M9.6 16.3c-.6-2.6.5-4.5 3.1-5.1.5 2.6-.6 4.5-3.1 5.1zM14.3 11.2c1.9 1.5 4 1.2 5.3-.9-1.9-1.5-4-1.2-5.3.9zM7.4 13.4c-2 .3-3.3-.9-3.4-3 2-.3 3.3.9 3.4 3z" /></>,
  back: <><path d="M14.75 5L7.75 12l7 7" /></>,
  chevron: <><path d="M9.5 6l6 6-6 6" /></>
};

/* Which glyph a tab wears, by where it goes. */
const BY_HREF: Record<string, string> = {
  '/app': 'home', '/console': 'home',
  '/app/pipeline': 'person', '/app/interviews': 'calendar', '/app/messages': 'message',
  '/app/care': 'briefcase', '/app/tasks': 'tasks', '/app/talent': 'person', '/app/how': 'book', '/app/value': 'chart',
  '/console/directory': 'people', '/console/placements': 'briefcase', '/console/money': 'card',
  '/console/messages': 'message'
};
export const glyphFor = (href: string, fallback?: string) => BY_HREF[href] ?? (fallback && G[fallback] ? fallback : 'home');

export function Glyph({ k }: { k: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{G[k] ?? G.home}</svg>
  );
}
