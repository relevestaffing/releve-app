'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VETTING_ITEMS, VETTING_WORDING, type Vetting } from '@/lib/work-public';
import { toast } from './Toast';

const TONE: Record<string, string> = {
  verified: 'good', rejected: 'crit', expired: 'warn', submitted: '', not_started: ''
};

export default function VettingUpload({ rows }: { rows: Vetting[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const byKind = Object.fromEntries(rows.map(r => [r.kind, r]));

  async function upload(kind: string, file: File, expires: string) {
    setBusy(kind);
    const body = new FormData();
    body.append('file', file);
    body.append('kind', kind);
    if (expires) body.append('expires_on', expires);
    try {
      const res = await fetch('/api/vetting', { method: 'POST', body });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'That did not upload.');
      toast.saved('Sent to Relève');
      router.refresh();
    } catch (e: any) {
      toast.bad(e.message);
    } finally { setBusy(null); }
  }

  const done = rows.filter(r => r.state === 'verified').length;

  async function view(path: string) {
    const res = await fetch(`/api/vetting?path=${encodeURIComponent(path)}`);
    const d = await res.json();
    if (!res.ok) return toast.bad(d.error ?? 'Could not open that.');
    window.open(d.url, '_blank', 'noopener');
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Before you can be placed</h3>
        <span className={`pill ${done === VETTING_ITEMS.length ? 'good' : ''}`}>
          {done === VETTING_ITEMS.length && <span className="dot" />}
          {done} of {VETTING_ITEMS.length} cleared
        </span>
      </div>
      <p className="small muted" style={{ marginBottom: 24 }}>
        We check these once, for everyone. It is the reason an executive is willing to hand you their calendar
        in the first week rather than the third month. Nothing here is ever shown to a client —
        they see that you are cleared, never the documents.
      </p>

      {VETTING_ITEMS.map(item => {
        const row = byKind[item.kind] as Vetting | undefined;
        const state = row?.state ?? 'not_started';
        return (
          <div className="vet-item" key={item.kind}>
            <div className="row between" style={{ alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4>{item.label}</h4>
                <p className="small muted" style={{ margin: '4px 0 0' }}>{item.ask}</p>
                <p className="xs muted" style={{ margin: '6px 0 0' }}>{item.why}</p>
                {state === 'rejected' && row?.reject_reason && (
                  <p className="small" style={{ color: '#7A2E26', marginTop: 10 }}>
                    <b>Needs another go:</b> {row.reject_reason}
                  </p>
                )}
                {state === 'verified' && row?.expires_on && (
                  <p className="xs muted" style={{ marginTop: 8 }}>
                    Valid until {new Date(row.expires_on + 'T00:00:00')
                      .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <span className={`pill ${TONE[state]}`}>
                {state === 'verified' && <span className="dot" />}{VETTING_WORDING[state]}
              </span>
            </div>

            {/* Documents Relève issues: the candidate reads them, never uploads. */}
            {item.issuedByTeam ? (
              <div className="vet-actions">
                {row?.file_path
                  ? <button className="btn sm ghost" onClick={() => view(row.file_path!)}>
                      Read your {item.label.toLowerCase()}
                    </button>
                  : <span className="xs muted">
                      We will send this to you to sign, then file it here. Nothing to do yet.
                    </span>}
              </div>
            ) : state !== 'verified' && (
              <div className="vet-actions">
                <input
                  ref={el => { inputs.current[item.kind] = el; }}
                  type="file" accept="application/pdf,image/*" hidden
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const exp = item.expires
                      ? (document.getElementById(`exp-${item.kind}`) as HTMLInputElement)?.value ?? ''
                      : '';
                    upload(item.kind, f, exp);
                    e.target.value = '';
                  }} />
                {item.expires && (
                  <label className="vet-exp">
                    <span className="xs muted">Expiry date</span>
                    <input id={`exp-${item.kind}`} type="date" />
                  </label>
                )}
                <button className="btn sm solid" disabled={busy === item.kind}
                  onClick={() => inputs.current[item.kind]?.click()}>
                  {busy === item.kind ? 'Uploading…'
                    : state === 'submitted' ? 'Replace document' : 'Upload'}
                </button>
                {state === 'submitted' && <span className="xs muted">We will look at this within a day.</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
