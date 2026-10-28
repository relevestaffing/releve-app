import InterestedForm from '@/components/InterestedForm';

export const metadata = { title: "Tell us you're interested" };

/* A public page, no session and no Shell, the same ivory-on-fern look as the
   sign-in and deposit pages. Reachable logged out: it sits beside /pay at the
   top level, so the /app auth gate never touches it, and the middleware only
   refreshes the session cookie rather than redirecting. */
export default function Interested() {
  return (
    <div className="auth">
      <div>
        <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="auth-card">
          <InterestedForm />
        </div>
        <p className="small muted" style={{ marginTop: 26 }}>Relève Executive Staffing · Consider it handled.</p>
      </div>
    </div>
  );
}
