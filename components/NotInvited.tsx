import { INVITE_ONLY, DISCOVERY_URL, CONTACT } from '@/lib/invite-copy';
import './experience.css';

/* Where an account lands if it exists without an invitation behind it. The
   database and the sign-in callback both refuse strangers before an account is
   made, so this is the last line: anyone who still gets as far as a session
   is told plainly, and shown the way in, instead of being asked which side
   they are on. No buttons here that would create anything. */
export default function NotInvited({ email }: { email?: string | null }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <img className="logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="welcome-card">
          <h1>Relève is by invitation</h1>
          <p className="lede">
            {email ? <>We have no invitation on file for <b>{email}</b>.</> : 'We have no invitation on file for this address.'}
          </p>
          <p className="small" style={{ marginTop: 14 }}>
            Accounts open when Relève sends an onboarding email. If you were expecting one,
            sign out and sign in with the address it was sent to.
          </p>
          <p className="small" style={{ marginTop: 14 }}>
            To work with us, <a href={DISCOVERY_URL} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>book a discovery call</a>, or write to{' '}
            <a href={`mailto:${CONTACT}`} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{CONTACT}</a>.
          </p>
        </div>
        <form action="/api/signout" method="post" style={{ margin: '18px 0 0' }}>
          <button className="gate-link" type="submit">Sign out</button>
        </form>
      </div>
    </div>
  );
}
