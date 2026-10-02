'use client';
import { useEffect, useState, useId } from 'react';
import { hasSupabase, supabaseBrowser } from '@/lib/supabase/client';

/* A message the friendliest way to say "that link didn't work" can manage —
   Supabase's own wording (e.g. "Email link is invalid or has expired") is
   accurate but reads like a stack trace. Anything unrecognised still shows
   verbatim rather than being swallowed. */
function friendly(raw: string): string {
  const low = raw.toLowerCase();
  if (low.includes('expired') || low.includes('invalid'))
    return 'That link has already been used or has expired. Links are one-time and last an hour. Send yourself a new one below.';
  return raw;
}

export default function SignIn({ initialError }: { initialError?: string }) {
  const fid = useId();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(initialError ? friendly(initialError) : null);
  const [busy, setBusy] = useState(false);
  const [gBusy, setGBusy] = useState(false);
  const live = hasSupabase();

  /* Drop ?error=… from the address bar once it has been shown, so refreshing
     this page — or coming back to it later — does not keep repeating it. */
  useEffect(() => {
    if (initialError && typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!live) { window.location.href = '/app'; return; }
    setBusy(true); setErr(null);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }
  /* The button used to sit unchanged while Google loaded, and a refusal said
     nothing at all. It now says it is working, and says so if it did not. */
  async function google() {
    if (!live) { window.location.href = '/app'; return; }
    setGBusy(true); setErr(null);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` }
      });
      if (error) throw error;
      /* On success the browser is already on its way to Google. If it is
         still here after a while, let the button be pressed again. */
      window.setTimeout(() => setGBusy(false), 8000);
    } catch {
      setGBusy(false);
      setErr('Google sign-in did not open. Please try again, or use the email link above.');
    }
  }

  return (
    <div className="auth">
      <div>
        <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="auth-card">
          {sent ? (
            <>
              <h2 style={{ fontSize: 24, marginBottom: 12 }}>Check your email</h2>
              <p className="note">A sign-in link is on its way to <b>{email}</b>. It is valid for one hour and opens your account directly. There is no password to remember.</p>
              <button className="btn ghost sm" style={{ marginTop: 22 }} onClick={() => setSent(false)}>Use a different address</button>
            </>
          ) : (
            <>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Accounts Center</div>
              <h2 style={{ fontSize: 24, marginBottom: 10 }}>Sign in</h2>
              <p className="note" style={{ marginBottom: 24 }}>
                {live ? 'Enter the email address your account is under. We will send you a link.'
                      : 'Preview mode: sign-in is skipped and nothing is saved.'}
              </p>
              <form onSubmit={magicLink}>
                <div className="ff">
                  <label htmlFor={`${fid}-1`}>Email</label>
                  <input id={`${fid}-1`} type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com" autoComplete="email" />
                </div>
                <button className="btn solid" style={{ width: '100%' }} disabled={busy}>
                  {busy ? 'Sending…' : live ? 'Email me a sign-in link' : 'Enter the demo'}
                </button>
              </form>
              <div className="divider">or</div>
              <button className="gbtn" onClick={google} disabled={gBusy} aria-busy={gBusy}>
                <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M45 24.5c0-1.6-.1-2.7-.4-3.9H24v7.1h12c-.2 1.9-1.5 4.7-4.4 6.6l6.7 5.2c4-3.7 6.7-9.1 6.7-15z"/>
                  <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41.2 15.4 46 24 46z"/>
                  <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z"/>
                  <path fill="#EA4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.3 29.9 2 24 2 15.4 2 8.1 6.8 4.4 14.1l7.1 5.5C13.3 14.3 18.2 10.5 24 10.5z"/>
                </svg>
                {gBusy ? 'Opening Google…' : 'Continue with Google'}
              </button>
              {err && <div className="err" role="alert">{err}</div>}
              <p className="note" style={{ marginTop: 22, fontSize: 12 }}>
                Talent applying for the first time should use the address on their application.
              </p>
            </>
          )}
        </div>
        <p className="small muted" style={{ marginTop: 26 }}>Relève Executive Staffing · Consider it handled.</p>
      </div>
    </div>
  );
}
