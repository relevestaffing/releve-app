'use client';
import { useEffect, useState, useId } from 'react';
import { hasSupabase, supabaseBrowser } from '@/lib/supabase/client';
import SunWall from '@/components/SunWall';
import { INVITE_ONLY, DISCOVERY_URL, CONTACT, NOT_INVITED_CODE } from '@/lib/invite-copy';
import './signin.css';

/* A message the friendliest way to say "that link didn't work" can manage —
   Supabase's own wording (e.g. "Email link is invalid or has expired") is
   accurate but reads like a stack trace. Anything unrecognised still shows
   verbatim rather than being swallowed. */
function friendly(raw: string): string {
  const low = raw.toLowerCase();
  /* Accounts are opened by invitation only (PART 60). Supabase words the refusal
     as a database or sign-up error, which says nothing useful to a person. */
  if (raw === NOT_INVITED_CODE || low.includes('database error') || low.includes('signups not allowed') || low.includes('invitation only') || low.includes('signup is disabled'))
    return INVITE_ONLY;
  if (low.includes('expired') || low.includes('invalid'))
    return 'That link has expired or has already been used. Each link works once, for one hour. Request a new one below.';
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
    if (error) setErr(friendly(error.message)); else setSent(true);
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
      <SunWall room />
      <div>
        <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="auth-card">
          {sent ? (
            <>
              <div className="auth-sent">
                <div className="auth-welcome">
                  <span className="eyebrow-rule" aria-hidden="true" />
                  <h2>Check your email</h2>
                </div>
                <p className="note">We have sent a sign-in link to <b>{email}</b>. It works for one hour.</p>
                <button className="btn ghost sm" style={{ marginTop: 24 }} onClick={() => setSent(false)}>Use a different email</button>
              </div>
            </>
          ) : (
            <>
              <div className="auth-welcome">
                <span className="eyebrow-rule" aria-hidden="true" />
                <h2>Welcome to Relève</h2>
                <p>{live ? 'Sign in to your account.' : 'Preview mode: sign-in is skipped and nothing is saved.'}</p>
              </div>
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
              {err === INVITE_ONLY && (
                <p className="note" style={{ marginTop: 14 }}>
                  To work with us, <a href={DISCOVERY_URL} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>book a discovery call</a>, or write to{' '}
                  <a href={`mailto:${CONTACT}`} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{CONTACT}</a>.
                </p>
              )}
            </>
          )}
        </div>
        <img className="auth-tagline" src="/consider-it-handled-cream.png" alt="Consider it handled." width={2755} height={414} />
      </div>
    </div>
  );
}
