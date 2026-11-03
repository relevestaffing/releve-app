/* The tab bar's own glyphs (Nona, 3 November 2026: thin custom icons, tab bar
   only). Drawn for Relève on one 24 px grid with a 1.5 stroke and round ends,
   so they read as one hand. Home is the arched doorway of the arched portrait
   frames on the site, not a stock house. Each glyph has a faint fill layer
   (.f) that comes up only on the tab you are on, the way a native tab marks
   its place. */
const G: Record<string, React.ReactNode> = {
  home: <><path className="f" d="M5.5 20.25V10.5a6.5 6.5 0 0 1 13 0v9.75z" /><path d="M5.5 20.25V10.5a6.5 6.5 0 0 1 13 0v9.75M3.5 20.25h17" /></>,
  person: <><circle className="f" cx="12" cy="8.5" r="3.6" /><circle cx="12" cy="8.5" r="3.6" /><path d="M4.75 20c.6-3.7 3.6-6.1 7.25-6.1s6.65 2.4 7.25 6.1" /></>,
  people: <><circle className="f" cx="9.25" cy="9" r="3.25" /><circle cx="9.25" cy="9" r="3.25" /><path d="M3 19.5c.5-3.3 3.1-5.4 6.25-5.4s5.75 2.1 6.25 5.4M15.5 5.9a3.2 3.2 0 0 1 0 6.2M17.6 14.4c1.9.7 3.1 2.4 3.4 5.1" /></>,
  calendar: <><rect className="f" x="3.75" y="5.25" width="16.5" height="15" rx="3" /><rect x="3.75" y="5.25" width="16.5" height="15" rx="3" /><path d="M3.75 10h16.5M8.25 3.25v4M15.75 3.25v4" /></>,
  message: <><path className="f" d="M5.25 4.75h13.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H10.5l-4.75 3.5v-3.5h-.5a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2z" /><path d="M5.25 4.75h13.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H10.5l-4.75 3.5v-3.5h-.5a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2z" /></>,
  briefcase: <><rect className="f" x="3.25" y="7.25" width="17.5" height="12.5" rx="2.5" /><rect x="3.25" y="7.25" width="17.5" height="12.5" rx="2.5" /><path d="M9 7.25V5.75a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v1.5M3.25 12.5h17.5" /></>,
  tasks: <><rect className="f" x="3.75" y="3.75" width="16.5" height="16.5" rx="3.5" /><rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3.5" /><path d="M8 12.25l2.6 2.6L16.25 9.2" /></>,
  card: <><rect className="f" x="2.75" y="5.75" width="18.5" height="12.5" rx="2.5" /><rect x="2.75" y="5.75" width="18.5" height="12.5" rx="2.5" /><path d="M2.75 10h18.5M6.5 14.5h3.5" /></>,
  book: <><path className="f" d="M12 6.75C10 5.2 7.4 4.7 4.25 5.2v13.1c3.15-.5 5.75 0 7.75 1.5 2-1.5 4.6-2 7.75-1.5V5.2C16.6 4.7 14 5.2 12 6.75z" /><path d="M12 6.75C10 5.2 7.4 4.7 4.25 5.2v13.1c3.15-.5 5.75 0 7.75 1.5 2-1.5 4.6-2 7.75-1.5V5.2C16.6 4.7 14 5.2 12 6.75zM12 6.75V19.8" /></>,
  chart: <><path d="M4 19.75h16M6.75 16.5v-4.25M11 16.5V7.75M15.25 16.5v-6.5M19.5 16.5V5.25" /></>,
  more: <><circle cx="5.5" cy="12" r="1.35" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.35" fill="currentColor" stroke="none" /></>,
  back: <><path d="M14.75 5L7.75 12l7 7" /></>,
  chevron: <><path d="M9.5 6l6 6-6 6" /></>
};

/* Which glyph a tab wears, by where it goes. */
const BY_HREF: Record<string, string> = {
  '/app': 'home', '/console': 'home',
  '/app/pipeline': 'person', '/app/interviews': 'calendar', '/app/messages': 'message',
  '/app/care': 'briefcase', '/app/tasks': 'tasks', '/app/how': 'book', '/app/value': 'chart',
  '/console/directory': 'people', '/console/placements': 'briefcase', '/console/money': 'card',
  '/console/messages': 'message'
};
export const glyphFor = (href: string, fallback?: string) => BY_HREF[href] ?? (fallback && G[fallback] ? fallback : 'home');

export function Glyph({ k }: { k: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{G[k] ?? G.home}</svg>
  );
}
