/* Turns whatever someone typed into working links.
   -------------------------------------------------
   Applicants paste a LinkedIn profile, a portfolio, sometimes three of them
   separated by commas or newlines. That arrived as plain text you had to
   select and copy, which is a small tax paid on every single application.

   The text comes from a stranger, so only http and https survive: anything
   else — javascript:, data:, a bare word with a colon in it — is printed as
   text and never becomes a link. Links open in a new tab and carry
   noopener/noreferrer/nofollow, so a page cannot reach back into the console
   and nothing here passes authority to a stranger's site. */

/* Three shapes people actually type: a full URL, a www. address, and a bare
   domain with a path — "linkedin.com/in/maria-santos", which is how most
   people write it. The bare form requires a slash and a path so that ordinary
   prose ("Notion, Slack, etc.") is never mistaken for an address. */
const URLISH = new RegExp(
  '(' +
    'https?:\\/\\/[^\\s<>"\'()]+' +
    '|www\\.[^\\s<>"\'()]+' +
    '|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9-]+)*\\.[a-z]{2,24}\\/[^\\s<>"\'()]*' +
  ')', 'gi');

/* Trailing punctuation belongs to the sentence, not the address. */
function trim(raw: string): { url: string; tail: string } {
  const m = raw.match(/[.,;:!?)\]]+$/);
  return m ? { url: raw.slice(0, -m[0].length), tail: m[0] } : { url: raw, tail: '' };
}

function safe(raw: string): string | null {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

/* Long URLs are unreadable and push a card sideways. Show the host and a hint
   of the path, keep the whole thing in the title attribute. */
function label(href: string): string {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, '');
    const path = (u.pathname + u.search).replace(/\/$/, '');
    const tail = path.length > 28 ? path.slice(0, 27) + '…' : path;
    return host + (tail === '' ? '' : tail);
  } catch { return href; }
}

export default function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URLISH);
  return (
    <p className={className ?? 'small'} style={{ margin: 0, wordBreak: 'break-word' }}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{part}</span>;
        const { url, tail } = trim(part);
        const href = safe(url);
        if (!href) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer nofollow"
              title={href} style={{ textDecoration: 'underline' }}>
              {label(href)}
            </a>{tail}
          </span>
        );
      })}
    </p>
  );
}
