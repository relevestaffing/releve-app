'use client';
import { useEffect, useState } from 'react';

/* Coming back from Stripe. ?paid=done, ?setup=done or ?deposit=done says
   what just happened, once, and then tidies the address bar so a refresh
   does not say it again. The webhook is still what marks anything paid;
   this only tells the person their part is done. */
const COPY: Record<string, Record<string, { head: string; body: string; tone: 'good' | '' }>> = {
  paid: {
    done: { head: 'Thank you. Your payment is on its way.', tone: 'good',
      body: 'A card settles in moments; a bank transfer takes a few business days and shows as clearing until then. A receipt follows by email.' },
    cancelled: { head: 'Nothing was charged.', tone: '', body: 'The invoice is still open whenever you are ready.' }
  },
  setup: {
    done: { head: 'Your payment method is on file.', tone: 'good',
      body: 'Future invoices are collected from it automatically when they are issued. It may take a moment to appear below.' },
    cancelled: { head: 'Nothing was changed.', tone: '', body: 'You can link a bank account or card whenever you are ready.' }
  },
  deposit: {
    done: { head: 'Thank you. Your deposit is on its way.', tone: 'good',
      body: 'Your search is open. A bank transfer takes a few business days to settle; nothing more is needed from you.' },
    cancelled: { head: 'Nothing was charged.', tone: '', body: 'Your deposit is ready whenever you are.' }
  }
};

export default function BillingReturnBanner() {
  const [msg, setMsg] = useState<{ head: string; body: string; tone: 'good' | '' } | null>(null);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      for (const key of Object.keys(COPY)) {
        const v = url.searchParams.get(key);
        if (v && COPY[key][v]) {
          setMsg(COPY[key][v]);
          url.searchParams.delete(key);
          window.history.replaceState(null, '', url.toString());
          break;
        }
      }
    } catch { /* nothing to read */ }
  }, []);

  if (!msg) return null;
  return (
    <div className="card tight" role="status"
      style={{ borderLeft: `3px solid var(--${msg.tone === 'good' ? 'good' : 'line-strong'})`, marginBottom: 20 }}>
      <div className="row between" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div>
          <b className="small">{msg.head}</b>
          <p className="xs muted" style={{ margin: '4px 0 0', maxWidth: 620 }}>{msg.body}</p>
        </div>
        <button className="btn sm ghost" onClick={() => setMsg(null)} aria-label="Dismiss">Close</button>
      </div>
    </div>
  );
}
