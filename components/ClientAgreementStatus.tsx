import { CONTACT_EMAIL } from '@/lib/experience-public';

type State = 'not_started' | 'submitted' | 'verified' | 'rejected';

/* Where the Client Services Agreement stands, for an executive. They read and
   sign it in the app (/app/agreement); this card is on the dashboard until it
   is done, with a button straight to it. */
export default function ClientAgreementStatus({ state }: { state: State }) {
  const copy: Record<Exclude<State, 'verified'>, { head: string; body: string }> = {
    not_started: {
      head: 'Sign your Client Services Agreement',
      body: 'Read and sign it here in your account. It takes a few minutes, and a copy is emailed to you.'
    },
    submitted: {
      head: 'Agreement signed',
      body: 'Received and on file.'
    },
    rejected: {
      head: 'Your agreement needs a closer look',
      body: 'Your Client Success Manager will be in touch about it.'
    }
  };
  if (state === 'verified') return (
    <div className="card">
      <div className="card-head">
        <h3>Your Client Services Agreement</h3>
        <span className="pill good"><span className="dot" />Signed and filed</span>
      </div>
      <p className="small muted" style={{ maxWidth: 'var(--measure)' }}>
        A copy was emailed to you, and you can download it here at any time.
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
          {state === 'submitted' ? 'Under review' : state === 'rejected' ? 'Needs a closer look' : 'To sign'}
        </span>
      </div>
      <p className="small muted" style={{ maxWidth: 'var(--measure)' }}>
        {body} Questions any time: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      {state === 'not_started' && <a className="btn solid" href="/app/agreement" style={{ marginTop: 8 }}>Read and sign</a>}
    </div>
  );
}
