'use client';
import { useEffect, useState } from 'react';
import { hasSupabase, supabaseBrowser } from '@/lib/supabase/client';
import { saving } from './Toast';

type State = { connected: boolean; configured: boolean; email?: string | null;
  connected_at?: string; busy?: number; error?: string | null; missing?: string[] };

export default function CalendarConnect() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() { setS(await (await fetch('/api/calendar')).json()); }
  useEffect(() => { load(); }, []);

  async function connect() {
    if (!hasSupabase()) { alert('Connect Supabase first — see SETUP.md stage 2.'); return; }
    setBusy(true);
    const sb = supabaseBrowser();
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?calendar=1`,
        scopes: 'https://www.googleapis.com/auth/calendar.freebusy',
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
  }
  async function disconnect() {
    setBusy(true);
    await saving(() => fetch('/api/calendar', { method: 'DELETE' }), 'Calendar disconnected');
    await load(); setBusy(false);
  }

  if (!s) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Google Calendar</h3>
        <span className={`pill ${s.connected ? (s.error ? 'crit' : 'good') : ''}`}>
          {s.connected && <span className="dot" />}{s.connected ? (s.error ? 'Needs reconnecting' : 'Connected') : 'Optional'}
        </span>
      </div>

      {s.connected ? (
        <>
          <p className="small" style={{ marginBottom: 14 }}>
            {s.error
              ? <>We can no longer read your calendar — <b>{s.error}</b> Reconnect below and it will start hiding conflicts again.</>
              : <>Your existing meetings are hidden automatically. Right now we are holding back{' '}
                  <b>{s.busy ?? 0} block{s.busy === 1 ? '' : 's'}</b> of busy time over the next ten days,
                  so nobody can book over something you already have.</>}
          </p>
          <p className="xs muted" style={{ marginBottom: 18 }}>
            Relève reads only <b>when</b> you are busy — never what the meeting is, who is in it, or anything written in it.
            {s.email && <> Connected as {s.email}.</>}
          </p>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn sm ghost" disabled={busy} onClick={connect}>Reconnect</button>
            <button className="btn sm ghost" disabled={busy} onClick={disconnect}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="small" style={{ marginBottom: 14 }}>
            Connect your calendar and anything already in it is hidden from your bookable times automatically —
            you keep the hours below as the times you are <i>willing</i> to meet, and your calendar removes the ones
            you are genuinely busy.
          </p>
          <p className="xs muted" style={{ marginBottom: 18 }}>
            Relève reads only your free/busy times. Never event titles, guests, or notes.
            You can disconnect at any moment.
          </p>
          <button className="btn solid" disabled={busy || !s.configured} onClick={connect}>
            {s.configured ? 'Connect Google Calendar' : 'Google Calendar not set up yet'}
          </button>
          {!s.configured && (
            <div className="xs muted" style={{ marginTop: 12, lineHeight: 1.7 }}>
              <b>Not switched on yet.</b> It needs two things, once, for the whole platform:
              <br />1. The Google Calendar API turned on, and the <code>calendar.freebusy</code> scope
              added to the consent screen, in the Google Cloud project.
              <br />2. {s.missing?.length
                ? <>These set in Netlify: <b>{s.missing.join(' and ')}</b>.</>
                : <>The OAuth client id and secret set in Netlify.</>}
              <br />Everything else is already built and waiting.
            </div>
          )}
        </>
      )}
    </div>
  );
}
