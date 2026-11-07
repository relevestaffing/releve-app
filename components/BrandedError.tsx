'use client';
import { CONTACT_EMAIL } from '@/lib/experience-public';
import './experience.css';

/* The one calm page for everything that went wrong: a missing page, a page
   that failed to load, the whole app failing. Same fern and cream as the rest
   of Relève, one sentence about what happened, and two ways forward: back to
   where you were, or a person. Never a stack trace, never a status code as
   the headline. */
export default function BrandedError({
  eyebrow, title, line, retry, home = '/app', digest, detail
}: {
  eyebrow?: string; title: string; line: string;
  retry?: () => void; home?: string; digest?: string;
  /* what actually went wrong, in one line, so a screenshot of this screen is enough to fix it */
  detail?: string;
}) {
  /* The page's own title is the subject; the digest rides along only there,
     where it helps whoever reads the email, never on the page itself. */
  const subject = encodeURIComponent(digest ? `${title} (ref ${digest})` : title);
  return (
    <main className="brand-error" role="main">
      <div className="brand-error-inner">
        <a href={home} className="brand-error-logo" aria-label="Relève home">
          <img src="/logo-fern.png" alt="Relève Executive Staffing" />
        </a>
        <div className="brand-error-card">
          {eyebrow && <div className="eyebrow" style={{ marginBottom: 12 }}>{eyebrow}</div>}
          <h1>{title}</h1>
          <p className="lede">{line}</p>
          <div className="brand-error-acts">
            {retry
              ? <button type="button" className="btn solid" onClick={retry}>Try again</button>
              : null}
            <button type="button" className={`btn ${retry ? 'ghost' : 'solid'}`}
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
                else window.location.href = home;
              }}>Back</button>
            <a className="btn ghost" href={`mailto:${CONTACT_EMAIL}?subject=${subject}`}>Write to us</a>
          </div>
          <p className="xs muted" style={{ marginTop: 18 }}>
            Write to {CONTACT_EMAIL}. We reply within one business day, usually sooner.
          </p>
          {(digest || detail) && (
            <p className="xs muted" style={{ marginTop: 10, opacity: .7, overflowWrap: 'anywhere' }}>
              {digest && <>Reference {digest}{detail ? ' · ' : ''}</>}{detail && detail.slice(0, 200)}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
