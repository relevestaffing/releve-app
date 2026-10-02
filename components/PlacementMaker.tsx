'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saving } from './Toast';
import { ENDED_REASONS, owesReplacement, type EndedReason } from '@/lib/care-public';
import PersonPicker from './PersonPicker';
import { todayInPacific } from '@/lib/money-public';

type Person = { id: string; full_name: string | null; email: string; role: string; org_name: string | null };
type Row = {
  id: string; client_name: string; talent_name: string; org_name: string | null;
  started_on: string; ended_on: string | null; notice_given_on?: string | null;
};

const label = (p: Person) =>
  `${p.full_name ?? p.email}${p.org_name ? ` · ${p.org_name}` : ''}`;
const day = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function PlacementMaker({ people, placements, owed = [], initialReplaces = '' }: {
  people: Person[]; placements: Row[];
  /* Endings that carry a replacement guarantee and have not been settled. */
  owed?: { id: string; client_id?: string; client_name: string; talent_name: string }[];
  /* Arriving from a placement file's "Place the replacement". */
  initialReplaces?: string;
}) {
  const fid = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState<{ id: string; reason: EndedReason } | null>(null);
  const startReplaces = owed.some(o => o.id === initialReplaces) ? initialReplaces : '';
  const [clientId, setClientId] = useState(owed.find(o => o.id === startReplaces)?.client_id ?? '');
  const [talentId, setTalentId] = useState('');
  /* Placing somebody as a replacement is what discharges the guarantee on the
     placement that failed. It has to be said at the moment of placing. */
  const [replaces, setReplaces] = useState(startReplaces);
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
        client_id: f.get('client_id'), talent_id: f.get('talent_id'),
        started_on: f.get('started_on'), rate: String(f.get('rate') ?? '').trim() || null,
        replaces_id: replaces || null
      })
    }), 'Placement created');
    setBusy(false);
    if (ok) { form.reset(); setClientId(''); setTalentId(''); setReplaces(''); router.refresh(); }
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
        ? 'Ended. A replacement is now owed, and it is listed here'
        : 'Placement ended');
    setBusy(false);
    setEnding(null); setConfirmEnd(null);
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
              Add them under Executives or the Talent Roster.
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
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label htmlFor={`${fid}-1`}>Start date</label>
                <input id={`${fid}-1`} type="date" name="started_on" defaultValue={todayInPacific()} /></div>
              <div className="ff"><label htmlFor={`${fid}-2`}>The executive pays, per month</label>
                <input id={`${fid}-2`} name="rate" inputMode="numeric" placeholder="3,500" />
                <span className="xs muted">Leave blank to set it later, but nothing is invoiced until you do.</span></div>
            </div>
            {owed.length > 0 && (
              <div className="ff">
                <label htmlFor={`${fid}-3`}>Is this a replacement? <span className="muted">(optional)</span></label>
                <select id={`${fid}-3`} value={replaces} onChange={e => setReplaces(e.target.value)}>
                  <option value="">No, this is a new placement</option>
                  {owed.map(o => (
                    <option key={o.id} value={o.id}>
                      Replaces {o.talent_name} with {o.client_name}
                    </option>
                  ))}
                </select>
                <span className="xs muted">
                  Saying so settles the replacement guarantee, and the replacement carries only what was
                  left of the original&rsquo;s three-month minimum, so the client never pays twice for one seat.
                </span>
              </div>
            )}
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
          <table className="data pm-table" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Executive</th><th>Talent</th><th>Since</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>
              {live.map(p => (
                <tr key={p.id}>
                  <td data-label="Executive"><b>{p.client_name}</b>{p.org_name && <div className="small muted">{p.org_name}</div>}</td>
                  <td data-label="Talent">{p.talent_name}</td>
                  <td data-label="Since" className="small muted">{day(p.started_on)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                      <Link className="btn sm ghost" href={`/console/placements/${p.id}`}>Open file</Link>
                      <Link className="btn sm ghost" href={`/console/placements/${p.id}#notice`}
                        title="Record notice on the placement file">
                        {p.notice_given_on ? 'Notice given' : 'Notice'}
                      </Link>
                      <button className="btn sm ghost" disabled={busy}
                        onClick={() => setEnding(ending === p.id ? null : p.id)}>
                        {ending === p.id ? 'Cancel' : 'End'}
                      </button>
                    </div>
                    {ending === p.id && (
                      <div className="end-why">
                        {confirmEnd?.id === p.id ? (
                          <>
                            <div className="xs" style={{ marginBottom: 8 }}>
                              End it today as {ENDED_REASONS.find(r => r.key === confirmEnd.reason)?.label}?{' '}
                              {owesReplacement(confirmEnd.reason)
                                ? 'Billing stops today; the replacement carries the rest of the minimum.'
                                : 'The minimum term and any notice period are still billed.'}
                            </div>
                            <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn sm solid danger" disabled={busy} onClick={() => end(p.id, confirmEnd.reason)}>Yes, end it</button>
                              <button className="btn sm ghost" disabled={busy} onClick={() => setConfirmEnd(null)}>Back</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="xs muted" style={{ marginBottom: 8 }}>Why is it ending?</div>
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {ENDED_REASONS.map(r => (
                                <button key={r.key} className="btn sm ghost" disabled={busy}
                                  onClick={() => setConfirmEnd({ id: p.id, reason: r.key })}>
                                  {r.label}{r.guaranteed && ' *'}
                                </button>
                              ))}
                            </div>
                            <div className="xs muted" style={{ marginTop: 8 }}>
                              * owes the client a free replacement
                            </div>
                          </>
                        )}
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
