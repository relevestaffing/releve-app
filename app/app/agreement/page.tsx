import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getClientAgreement } from '@/lib/agreement';
import { AGREEMENT_VERSION, AGREEMENT_TITLE, AGREEMENT_INTRO, AGREEMENT_SECTIONS } from '@/lib/agreement-text';
import Shell from '@/components/Shell';
import AgreementSign from '@/components/AgreementSign';

export const metadata = { title: 'Your agreement' };
export const dynamic = 'force-dynamic';

/* The Client Services Agreement, read and signed in the account. Reached from
   "Sign agreement" in the onboarding email, and open before the deposit: the
   agreement is step one of opening a search, not something that waits behind it. */
export default async function AgreementPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');
  if (profile.role !== 'client') redirect('/app');

  const row = await getClientAgreement(profile.id);
  const signed = row?.state === 'verified';

  return (
    <Shell profile={profile} active="/app/agreement" title="Your agreement" crumb="Client Services Agreement">
      {signed ? (
        <div className="card">
          <div className="card-head">
            <h3>Signed and filed</h3>
            <span className="pill good"><span className="dot" />Signed</span>
          </div>
          <p className="small muted" style={{ maxWidth: 560, marginBottom: 14 }}>
            Your Client Services Agreement is signed, and a copy was emailed to you. It is kept here too.
          </p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <a className="btn solid" href="/api/agreement/copy">Download your signed copy</a>
            <Link className="btn ghost" href="/app">Back to your account</Link>
          </div>
        </div>
      ) : (
        <p className="small muted" style={{ maxWidth: 560, margin: '0 0 16px' }}>
          Read the agreement below, then sign at the bottom. It takes a few minutes, and your signed copy is emailed to you.
        </p>
      )}

      <article className="card agr-read" aria-label={AGREEMENT_TITLE}>
        {AGREEMENT_INTRO.map((t, i) => t === 'Recitals'
          ? <h4 key={i} className="agr-h">Recitals</h4>
          : <p key={i}>{t}</p>)}
        {AGREEMENT_SECTIONS.map(s => (
          <section key={s.h}>
            <h3 className="agr-sec">{s.h}</h3>
            {s.items.map((it, i) => it.sub
              ? <h4 key={i} className="agr-h">{it.sub}</h4>
              : it.bullet
                ? <p key={i} className="agr-b">{it.bullet}</p>
                : <p key={i}>{it.p}</p>)}
          </section>
        ))}
      </article>

      {!signed && <AgreementSign name={profile.full_name} email={profile.email} version={AGREEMENT_VERSION} />}
    </Shell>
  );
}
