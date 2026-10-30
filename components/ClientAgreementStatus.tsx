import { CONTACT_EMAIL } from '@/lib/experience-public';

type State = 'not_started' | 'submitted' | 'verified' | 'rejected';

/* Where the Client Services Agreement stands, for an executive, while
   DocuSign is switched off.
   ---------------------------------------------------------------------
   ClientAgreementCard is the DocuSign version: it offers a Sign now button
   that calls the DocuSign API. With the API off (Relève is on DocuSign's Free
   plan by choice) that card is hidden, and the effect was that the contract
   for a $2,500+/month engagement appeared nowhere in the product at all —
   sent by hand, chased by hand, and invisible to the person who had to sign
   it. This is the read-only stand-in: no button, because there is genuinely
   nothing for them to click, but the state is on the page where both sides
   can see it. (12 October onboarding audit.)

   Deliberately not shown once verified — a signed agreement is not news. */
export default function ClientAgreementStatus({ state }: { state: State }) {
  const copy: Record<Exclude<State, 'verified'>, { head: string; body: string }> = {
    not_started: {
      head: 'Sign your Client Services Agreement',
      body: 'Read it and sign in your account. It takes a few minutes, and a copy is emailed to you.'
    },
    submitted: {
      head: 'Agreement signed',
      body: 'Received. Relève countersigns, and it is filed with us once it is complete.'
    },
    rejected: {
      head: 'Your agreement needs another look',
      body: 'Your Client Success Manager is in touch about it.'
    }
  };
  if (state === 'verified') return (
    <div className="card">
      <div className="card-head">
        <h3>Your Client Services Agreement</h3>
        <span className="pill good"><span className="dot" />Signed and filed</span>
      </div>
      <p className="small muted" style={{ maxWidth: 'var(--measure)' }}>
        Signed and on file. A copy was emailed to you, and you can download it any time.
      </p>
      <a className="btn sm ghost" href="/api/agreement/copy" style={{ marginTop: 6 }}>Download your copy</a>
    </div>
  );
  const { head, body } = copy[state];

  return (
    <div className="card">
      <div className="card-head">
        <h3>{head}</h3>
        <span className={`pill ${state === 'submitted' ? 'good' : 'warn'}`}>
          <span className="dot" />
          {state === 'submitted' ? 'With Relève' : state === 'rejected' ? 'Needs a look' : 'To sign'}
        </span>
      </div>
      <p className="small muted" style={{ maxWidth: 'var(--measure)' }}>
        {body} Questions any time: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      {state === 'not_started' && <a className="btn solid" href="/app/agreement" style={{ marginTop: 8 }}>Read and sign</a>}
    </div>
  );
}
