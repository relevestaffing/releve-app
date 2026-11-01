'use client';
import { useEffect, useState } from 'react';

/* Add-to-home-screen + turn-on-notifications.
   -------------------------------------------
   iOS only exposes the Notification and Push APIs to a PWA that has been
   added to the Home Screen and opened from there, so on an iPhone in Safari
   we show the install steps first and the enable button only appears once the
   app is running standalone. Android and desktop can enable straight away.
   The public VAPID key is not a secret; it ships in the client either from
   env or this baked-in default, so the only thing the server needs set is the
   private key. */
const VAPID_PUBLIC =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BL1YZ9kmHrX33B3kJAsojGt1J4XS8B89RMTMhIhBbPm589-8RAO-AqZl4zAbLS9WYGZxI5dbayWMd3vuoIr9CYo';

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Plat = 'ios' | 'android' | 'desktop';
function detect(): { plat: Plat; standalone: boolean; supported: boolean } {
  if (typeof navigator === 'undefined') return { plat: 'desktop', standalone: false, supported: false };
  const ua = navigator.userAgent || '';
  const iOS = /iP(hone|ad|od)/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const android = /Android/.test(ua);
  const standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as any).standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return { plat: iOS ? 'ios' : android ? 'android' : 'desktop', standalone, supported };
}

export default function PushSetup({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const [env, setEnv] = useState<{ plat: Plat; standalone: boolean; supported: boolean } | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'on' | 'denied' | 'error'>('idle');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const e = detect();
    setEnv(e);
    if (compact) { try { if (localStorage.getItem('releve_push_nudge_dismissed') === '1') setHidden(true); } catch {} }
    if (e.supported && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      /* Already granted on this device: sync the subscription to this account
         once per page. One idempotent upsert, so a sign-out (which removes the
         rows) followed by a sign-in on the same device is covered. */
      ensureSubscribed().then(ok => { if (ok) setState('on'); }).catch(() => {});
    }
  }, []);

  async function ensureSubscribed(): Promise<boolean> {
    /* .ready only resolves once a worker is active, and nothing else here
       guarantees one was registered on this visit, so register (idempotent)
       and refuse to wait more than ten seconds. */
    try { await navigator.serviceWorker.register('/sw.js'); } catch { /* unsupported or already registered */ }
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration>((_, rej) => setTimeout(() => rej(new Error('No service worker')), 10000))
    ]);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) });
    }
    const r = await fetch('/api/push/subscribe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    return r.ok;
  }

  async function enable() {
    setState('working');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('denied'); return; }
      const ok = await ensureSubscribed();
      setState(ok ? 'on' : 'error');
      if (ok && onDone) onDone();
    } catch {
      setState('error');
    }
  }

  if (!env || hidden) return null;
  // Nothing we can do on a browser with no push support: stay quiet rather than nag.
  if (!env.supported && !(env.plat === 'ios' && !env.standalone)) {
    if (compact) return null;
    return (
      <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: 0, color: '#516053' }}>
        This browser cannot show notifications. Nothing to do here: open Relève on your phone later and we will walk you through it there.
      </p>
    );
  }

  const wrap: React.CSSProperties = compact
    ? { border: '1px solid #D8DED6', background: '#F7F5EF', padding: '16px 18px' }
    : { background: '#35443A', color: '#F3EFE6', padding: '26px 24px' };
  const head: React.CSSProperties = { fontFamily: "'Marcellus',Georgia,serif", fontSize: compact ? 17 : 22, margin: '0 0 6px', color: compact ? '#26312B' : '#FBF8F1' };
  const sub: React.CSSProperties = { fontSize: 14.5, lineHeight: 1.6, margin: '0 0 14px', color: compact ? '#516053' : '#CBD4CC' };
  const btn: React.CSSProperties = { display: 'inline-block', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', padding: '13px 24px', background: compact ? '#35443A' : '#FBF8F1', color: compact ? '#FBF8F1' : '#35443A' };
  const stepList: React.CSSProperties = { margin: '0 0 14px', padding: 0, listStyle: 'none', fontSize: 14.5, lineHeight: 1.7, color: compact ? '#3A463D' : '#E7ECE6' };

  if (state === 'on') {
    if (compact) return null;
    return (
      <div style={wrap}>
        <div style={head}>Notifications are on.</div>
        <p style={{ ...sub, margin: 0 }}>You will hear the moment something needs you on this device.</p>
      </div>
    );
  }

  // iPhone/iPad in Safari, not yet installed: show the install steps.
  if (env.plat === 'ios' && !env.standalone) {
    return (
      <div style={wrap}>
        <div style={head}>Put Relève on your phone</div>
        <p style={sub}>Add Relève to your Home Screen so it opens like an app and can reach you with notifications.</p>
        <ol style={{ ...stepList, counterReset: 'n', paddingLeft: 0 }}>
          <li style={{ marginBottom: 8 }}><b>1.</b> Tap the <b>Share</b> icon at the bottom of Safari (the square with an arrow pointing up).</li>
          <li style={{ marginBottom: 8 }}><b>2.</b> Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          <li style={{ marginBottom: 8 }}><b>3.</b> Open <b>Relève</b> from the new icon on your Home Screen.</li>
          <li><b>4.</b> You will be asked to turn on notifications. Tap <b>Allow</b>.</li>
        </ol>
        <p style={{ ...sub, margin: 0, fontStyle: 'italic' }}>Notifications can only be turned on from the Home Screen app, not this Safari tab.</p>
        {compact && (
          <button onClick={() => { setHidden(true); try { localStorage.setItem('releve_push_nudge_dismissed', '1'); } catch {} }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7A8A7C', fontSize: 13, textDecoration: 'underline', marginTop: 12, padding: 0 }}>
            Not now
          </button>
        )}
      </div>
    );
  }

  // Android / desktop / installed iOS: enable directly.
  return (
    <div style={wrap}>
      <div style={head}>Turn on notifications</div>
      <p style={sub}>
        Hear the moment something needs you: a message, an update on your placement, an interview or a reminder.
        {env.plat === 'android' ? ' You can also add Relève to your home screen from your browser menu, for one-tap access.' : ''}
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={btn} onClick={enable} disabled={state === 'working'}>
          {state === 'working' ? 'One moment…' : 'Turn on notifications'}
        </button>
        {compact && (
          <button onClick={() => { setHidden(true); try { localStorage.setItem('releve_push_nudge_dismissed', '1'); } catch {} }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7A8A7C', fontSize: 13, textDecoration: 'underline' }}>
            Not now
          </button>
        )}
      </div>
      {state === 'denied' && <p style={{ ...sub, margin: '12px 0 0' }}>Notifications are blocked for this site. Turn them back on in your browser settings for relevestaffing.com, then try again.</p>}
      {state === 'error' && <p style={{ ...sub, margin: '12px 0 0' }}>That did not go through. Please try again in a moment.</p>}
    </div>
  );
}
