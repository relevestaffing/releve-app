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
        <img className="auth-tagline" src="/consider-it-handled.png" alt="Consider it handled." width={2755} height={414} />
      </div>
    </div>
  );
}
