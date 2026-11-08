'use client';
import Link from 'next/link';
import OnboardingSender from './OnboardingSender';

/* Where a lead stands on onboarding, and the one button that moves it.
   Sending opens their search and emails the agreement and the deposit link.
   They stay a lead (Deciding) until they sign; signing is what makes them an
   executive. */
export default function LeadOnboarding({ lead }: {
  lead: { id: string; full_name: string; email: string; stage: string; pending_id: string | null };
}) {
  const signed = lead.stage === 'won';
  const sent = !signed && Boolean(lead.pending_id);
  const head = signed ? 'Signed' : sent ? 'Onboarding sent' : 'Send onboarding';
  const line = signed
    ? 'They signed the agreement and are an executive now.'
    : sent
      ? 'The agreement and deposit link are with them. They become an executive the moment they sign. A follow-up is set for three days after sending.'
      : 'After the call and the audit: this opens their search and emails the agreement and deposit link. They become an executive the moment they sign.';
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="crumb">Onboarding</div>
          <h3>{head}</h3>
        </div>
        {signed
          ? <Link className="btn sm ghost" href="/console/people">See executives</Link>
          : <OnboardingSender prefill={{ name: lead.full_name, email: lead.email }} prospectId={lead.id}
              startClosed label={sent ? 'Resend onboarding' : 'Send onboarding'} />}
      </div>
      <p className="small muted" style={{ margin: 0, maxWidth: 560 }}>{line}</p>
    </div>
  );
}
