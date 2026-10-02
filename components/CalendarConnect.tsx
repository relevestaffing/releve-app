'use client';
import { useEffect, useState } from 'react';
import { hasSupabase, supabaseBrowser } from '@/lib/supabase/client';
import { saving, toast } from './Toast';

type State = { connected: boolean; configured: boolean; email?: string | null;
  connected_at?: string; busy?: number; error?: string | null; missing?: string[] };

export default function CalendarConnect() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /* A failed read used to leave the card blank with no word about why. */
  async function load() {
    setFailed(false);
    try {
      const r = await fetch('/api/calendar', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setS(await r.json());
    } catch { setFailed(true); }
  }
  useEffect(() => { load(); }, []);

  async function connect() {
    if (!hasSupabase()) return;
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?calendar=1`,
          scopes: 'https://www.googleapis.com/auth/calendar.freebusy',
          queryParams: { access_type: 'offline', prompt: 'consent' }
        }
      });
      if (error) throw error;
      /* On success the browser is already leaving for Google; nothing to reset. */
    } catch {
      setBusy(false);
      toast.bad('Google did not open. Please try again; your hours below still work as they are.');
    }
  }
  async function disconnect() {
    setBusy(true);
    await saving(() => fetch('/api/calendar', { method: 'DELETE' }), 'Calendar disconnected');
    await load(); setBusy(false);
  }

  if (failed) return (
    <div className="card">
      <div className="card-head"><h3>Google Calendar</h3></div>
      <p className="small muted" style={{ marginBottom: 14 }}>Your calendar connection did not load. Your hours below still work as they are.</p>
      <button className="btn sm ghost" onClick={load}>Try again</button>
    </div>
  );
  /* Not switched on for this site: no card at all, rather than a promise of
     something "coming". The hours below are what interviews are booked against. */
  if (!s || (!s.configured && !s.connected)) return null;

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
              ? <>We can no longer read your calendar: <b>{s.error}</b> Reconnect below and it will start hiding conflicts again.</>
              : <>Your existing meetings are hidden automatically. Right now we are holding back{' '}
                  <b>{s.busy ?? 0} block{s.busy === 1 ? '' : 's'}</b> of busy time over the next ten days,
                  so nobody can book over something you already have.</>}
          </p>
          <p className="xs muted" style={{ marginBottom: 18 }}>
            Relève reads only <b>when</b> you are busy, never what the meeting is, who is in it, or anything written in it.
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
            Connect your calendar and anything already in it is hidden from your bookable times automatically:
            you keep the hours below as the times you are <i>willing</i> to meet, and your calendar removes the ones
            you are genuinely busy.
          </p>
          <p className="xs muted" style={{ marginBottom: 18 }}>
            Relève reads only your free/busy times. Never event titles, guests, or notes.
            You can disconnect at any moment.
          </p>
          <button className="btn solid" disabled={busy} onClick={connect}>
            {busy ? 'Opening Google…' : 'Connect Google Calendar'}
          </button>
        </>
      )}
    </div>
  );
}
