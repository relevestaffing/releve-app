import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getClientAgreement } from '@/lib/agreement';
import { supabaseServer, configured } from '@/lib/supabase/server';
import { TALENT_AGREEMENT_VERSION, TALENT_AGREEMENT_TITLE, TALENT_AGREEMENT_INTRO, TALENT_AGREEMENT_SECTIONS } from '@/lib/talent-agreement-text';
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
  if (profile.role !== 'client' && profile.role !== 'talent') redirect('/app');

  const talent = profile.role === 'talent';
  let signed = false;
  if (talent) {
    if (configured()) {
      const sb = await supabaseServer();
      const { data } = await sb.from('vetting').select('state').eq('talent_id', profile.id).eq('kind', 'agreement').maybeSingle();
      signed = (data as any)?.state === 'verified';
    }
  } else {
    signed = (await getClientAgreement(profile.id))?.state === 'verified';
  }
  const title = talent ? TALENT_AGREEMENT_TITLE : AGREEMENT_TITLE;
  const intro = talent ? TALENT_AGREEMENT_INTRO : AGREEMENT_INTRO;
  const sections = talent ? TALENT_AGREEMENT_SECTIONS : AGREEMENT_SECTIONS;

  return (
    <Shell profile={profile} active="/app/agreement" title="Your agreement" crumb={title}>
      {signed ? (
        <div className="card">
          <div className="card-head">
            <h3>Signed and filed</h3>
            <span className="pill good"><span className="dot" />Signed</span>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {talent
              ? <Link className="btn solid" href="/app/vetting">See it on your Verification page</Link>
              : <a className="btn solid" href="/api/agreement/copy">Download your signed copy</a>}
            <Link className="btn ghost" href="/app">Back to your account</Link>
          </div>
        </div>
      ) : (
        <p className="small muted" style={{ maxWidth: 560, margin: '0 0 16px' }}>
          Sign at the bottom. Your copy is emailed to you.
        </p>
      )}

      <article className="card agr-read" aria-label={title}>
        {intro.map((t, i) => t === 'Recitals'
          ? <h4 key={i} className="agr-h">Recitals</h4>
          : <p key={i}>{t}</p>)}
        {sections.map(s => (
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

      {!signed && <AgreementSign name={profile.full_name} email={profile.email} kind={talent ? 'talent' : 'client'}
        version={talent ? TALENT_AGREEMENT_VERSION : AGREEMENT_VERSION} />}
    </Shell>
  );
}
