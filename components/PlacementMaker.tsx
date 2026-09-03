'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saving } from './Toast';
import { ENDED_REASONS, owesReplacement, type EndedReason } from '@/lib/care-public';
import PersonPicker from './PersonPicker';

type Person = { id: string; full_name: string | null; email: string; role: string; org_name: string | null };
type Row = {
  id: string; client_name: string; talent_name: string; org_name: string | null;
  started_on: string; ended_on: string | null;
};

const label = (p: Person) =>
  `${p.full_name ?? p.email}${p.org_name ? ` · ${p.org_name}` : ''}`;
const day = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function PlacementMaker({ people, placements }: { people: Person[]; placements: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [talentId, setTalentId] = useState('');
  const [find, setFind] = useState('');
  const clients = people.filter(p => p.role === 'client');
  const talent = people.filter(p => p.role === 'talent');
  /* One box searches both lists — by executive, company or talent. */
  const hit = (p: Row) => {
    const n = find.trim().toLowerCase();
    if (!n) return true;
    return [p.client_name, p.talent_name, p.org_name]
      .filter(Boolean).some(f => String(f).toLowerCase().includes(n));
  };
  const live = placements.filter(p => !p.ended_on && hit(p));
  const past = placements.filter(p => p.ended_on && hit(p));

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/placements', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: f.get('client_id'), talent_id: f.get('talent_id'), started_on: f.get('started_on')
      })
    }), 'Placement created');
    setBusy(false);
    if (ok) { form.reset(); setClientId(''); setTalentId(''); router.refresh(); }
  }

  /* Ending a placement asks why, because the answer decides whether the
     replacement guarantee is owed. Without it the promise is only ever
     remembered, which means sometimes it is not. */
  async function end(id: string, reason: EndedReason) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/placements', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, reason })
    }), owesReplacement(reason)
        ? 'Ended — a replacement is now owed, and it is on the Care page'
        : 'Placement ended');
    setBusy(false);
    setEnding(null);
    if (ok) router.refresh();
  }

  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Place someone</h3>
          <span className="pill">{live.length} running</span></div>
        {clients.length === 0 || talent.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">
              You need at least one executive and one talent account before a placement can exist.
              Add them under Clients or the Talent Bench.
            </p></div>
        ) : (
          <form onSubmit={create}>
            <div className="grid-2" style={{ gap: 14 }}>
              <PersonPicker label="Executive" name="client_id" people={clients}
                value={clientId} onChange={setClientId}
                placeholder="Type a name or company…" />
              <PersonPicker label="Talent" name="talent_id" people={talent}
                value={talentId} onChange={setTalentId}
                placeholder="Type a name…" />
            </div>
            <div className="ff" style={{ maxWidth: 260 }}><label>Start date</label>
              <input type="date" name="started_on" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <p className="xs muted" style={{ marginBottom: 16 }}>
              This opens their shared task list and starts the weekly check-ins. The talent's stage moves to Placed.
            </p>
            <button className="btn solid" disabled={busy || !clientId || !talentId}>
              {busy ? 'Saving…' : 'Create placement'}
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Running</h3>
          <div className="ff picker-inline">
            <input value={find} onChange={e => setFind(e.target.value)}
              placeholder="Search placements…" aria-label="Search placements" />
          </div>
        </div>
        {live.length === 0 ? (
          <div className="empty"><span className="tick" /><p className="small">
            {find.trim() ? `Nobody running matches “${find.trim()}”.` : 'No placements yet.'}
          </p></div>
        ) : (
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Executive</th><th>Talent</th><th>Since</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>
              {live.map(p => (
                <tr key={p.id}>
                  <td><b>{p.client_name}</b>{p.org_name && <div className="small muted">{p.org_name}</div>}</td>
                  <td>{p.talent_name}</td>
                  <td className="small muted">{day(p.started_on)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                      <Link className="btn sm ghost" href={`/console/placements/${p.id}`}>Open file</Link>
                      <button className="btn sm ghost" disabled={busy}
                        onClick={() => setEnding(ending === p.id ? null : p.id)}>
                        {ending === p.id ? 'Cancel' : 'End'}
                      </button>
                    </div>
                    {ending === p.id && (
                      <div className="end-why">
                        <div className="xs muted" style={{ marginBottom: 8 }}>Why is it ending?</div>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {ENDED_REASONS.map(r => (
                            <button key={r.key} className="btn sm ghost" disabled={busy}
                              onClick={() => end(p.id, r.key)}>
                              {r.label}{r.guaranteed && ' *'}
                            </button>
                          ))}
                        </div>
                        <div className="xs muted" style={{ marginTop: 8 }}>
                          * owes the client a free replacement
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {past.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Ended</h3><span className="pill">{past.length}</span></div>
          <ul className="past-list">
            {past.map(p => (
              <li key={p.id}>
                <span className="past-date">{day(p.ended_on!)}</span>
                <span className="small">{p.talent_name} with {p.client_name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
