import { verifyDepositLink } from '@/lib/deposit-link';
import { signerForSearch, searchSigned } from '@/lib/agreement-link';
import { AGREEMENT_TITLE, AGREEMENT_INTRO } from '@/lib/agreement-text';
import { agreementVersionFor, agreementSectionsFor } from '@/lib/client-addenda';
import AgreementSign from '@/components/AgreementSign';

export const metadata = { title: 'Your agreement' };
export const dynamic = 'force-dynamic';

/* Step one of the onboarding email. No account and no sign-in: the link
   itself names the search. Read, sign, and on to the deposit. */
export default async function SignAgreement({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = verifyDepositLink(token);
  const who = link ? await signerForSearch(link.searchId) : null;
  const signed = link ? await searchSigned(link.searchId) : false;

  if (!link || !who) return (
    <div className="auth"><div>
      <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
      <div className="auth-card">
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>That link has expired</h2>
        <p className="note">Your Client Success Manager can send you a new one.</p>
      </div>
    </div></div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper, #FAF8F2)', padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <img src="/logo-fern.png" alt="Relève Executive Staffing" style={{ display: 'block', margin: '0 auto 28px', width: 190, height: 'auto' }} />
        <div className="eyebrow" style={{ textAlign: 'center', marginBottom: 6 }}>Step 1 of 4</div>
        <h2 style={{ textAlign: 'center', fontSize: 28, margin: '0 0 22px' }}>{signed ? 'Your agreement is signed' : 'Sign your agreement'}</h2>
        {signed ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="small" style={{ marginBottom: 16 }}>Thank you. Your copy has been sent to {who.email}.</p>
            <a className="btn solid" href={`/pay/${encodeURIComponent(token)}`}>Continue to your deposit</a>
          </div>
        ) : (
          <>
            <article className="card agr-read" aria-label={AGREEMENT_TITLE} style={{ maxWidth: 'none' }}>
              {AGREEMENT_INTRO.map((t, i) => t === 'Recitals' ? <h4 key={i} className="agr-h">Recitals</h4> : <p key={i}>{t}</p>)}
              {agreementSectionsFor(who.email).map(s => (
                <section key={s.h}>
                  <h3 className="agr-sec">{s.h}</h3>
                  {s.items.map((it, i) => it.sub ? <h4 key={i} className="agr-h">{it.sub}</h4>
                    : it.bullet ? <p key={i} className="agr-b">{it.bullet}</p> : <p key={i}>{it.p}</p>)}
                </section>
              ))}
            </article>
            <AgreementSign name={who.name} email={who.email} version={agreementVersionFor(who.email)} token={token} />
          </>
        )}
      </div>
    </div>
  );
}
