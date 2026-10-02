'use client';
import { CONTACT_EMAIL } from '@/lib/experience-public';
import './experience.css';

/* The one calm page for everything that went wrong: a missing page, a page
   that failed to load, the whole app failing. Same fern and cream as the rest
   of Relève, one sentence about what happened, and two ways forward: back to
   where you were, or a person. Never a stack trace, never a status code as
   the headline. */
export default function BrandedError({
  eyebrow, title, line, retry, home = '/app', digest
}: {
  eyebrow?: string; title: string; line: string;
  retry?: () => void; home?: string; digest?: string;
}) {
  const subject = encodeURIComponent(digest ? `Something did not load (ref ${digest})` : 'Something did not load');
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
            {CONTACT_EMAIL} reaches a person. Replies within one business day, usually sooner.
            {digest ? <> Reference {digest}.</> : null}
          </p>
        </div>
      </div>
    </main>
  );
}
