'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  id: string; email: string; full_name: string | null; origin: string; source: string | null;
  subscribed: boolean; unsubscribed_at: string | null; training_at: string | null; created_at: string;
};

const ORIGIN: Record<string, string> = { training: 'Free training', lead: 'Lead', client: 'Client', import: 'Imported' };
const day = (s: string | null) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' }) : '';

export default function SubscriberList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'on' | 'off'>('all');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r =>
      (show === 'all' || (show === 'on') === r.subscribed) &&
      (!s || r.email.toLowerCase().includes(s) || (r.full_name ?? '').toLowerCase().includes(s)));
  }, [rows, q, show]);

  const on = rows.filter(r => r.subscribed).length;

  async function act(r: Row, action: 'unsubscribe' | 'resubscribe') {
    setBusy(r.id); setNote('');
    try {
      const res = await fetch('/api/admin/subscribers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, action }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'That did not save.');
      setNote(action === 'unsubscribe' ? `${r.email} is unsubscribed and will receive no further list emails.` : `${r.email} is subscribed again.`);
      setConfirm(null);
      router.refresh();
    } catch (e: any) { setNote(e?.message || 'That did not save.'); }
    setBusy('');
  }

  return (
    <>
      <div className="card tight">
        <p className="small" style={{ margin: 0, maxWidth: 680 }}>
          <b>Everyone on Relève&rsquo;s email list.</b> If someone asks to stop receiving emails, find them
          here and press <b>Unsubscribe</b>. It works the same as their own unsubscribe link, takes effect
          immediately, and can be undone.
        </p>
      </div>

      <div className="grid-4">
        <div className="card stat"><div className="eyebrow">On the list</div><div className="score">{on}</div></div>
        <div className="card stat"><div className="eyebrow">Unsubscribed</div><div className="score">{rows.length - on}</div></div>
        <div className="card stat"><div className="eyebrow">From the free training</div><div className="score">{rows.filter(r => r.training_at).length}</div></div>
        <div className="card stat"><div className="eyebrow">Total</div><div className="score">{rows.length}</div></div>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input style={{ flex: '1 1 260px', minWidth: 0 }} placeholder="Search by name or email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search the list" />
          <div className="row" style={{ gap: 6 }}>
            {(['all', 'on', 'off'] as const).map(k => (
              <button key={k} className={`btn sm${show === k ? ' solid' : ' ghost'}`} onClick={() => setShow(k)}>
                {k === 'all' ? 'Everyone' : k === 'on' ? 'Subscribed' : 'Unsubscribed'}
              </button>
            ))}
          </div>
        </div>
        {note && <p className="small" role="status" style={{ margin: '0 0 12px' }}>{note}</p>}

        {list.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>{rows.length ? 'No one matches that search.' : 'No one is on the list yet. Sign-ups from the website and the free training appear here automatically.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead><tr><th>Person</th><th>Joined from</th><th>Added</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                    <td><div>{r.full_name || r.email}</div>{r.full_name && <div className="small muted">{r.email}</div>}</td>
                    <td className="small">{ORIGIN[r.origin] ?? r.origin}{r.source ? ` · ${r.source}` : ''}{r.training_at && r.origin !== 'training' ? ' · took the training' : ''}</td>
                    <td className="small">{day(r.created_at)}</td>
                    <td>{r.subscribed
                      ? <span className="pill good">Subscribed</span>
                      : <span className="pill">Unsubscribed {day(r.unsubscribed_at)}</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.subscribed ? (confirm === r.id ? (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn sm solid" disabled={busy === r.id} onClick={() => act(r, 'unsubscribe')}>{busy === r.id ? 'Saving…' : 'Yes, unsubscribe'}</button>
                          <button className="btn sm ghost" onClick={() => setConfirm(null)}>Cancel</button>
                        </span>
                      ) : <button className="btn sm ghost" onClick={() => setConfirm(r.id)}>Unsubscribe</button>)
                      : <button className="btn sm ghost" disabled={busy === r.id} onClick={() => act(r, 'resubscribe')}>{busy === r.id ? 'Saving…' : 'Resubscribe'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
