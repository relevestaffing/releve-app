'use client';
import { openSignedLink } from '@/lib/open-tab';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VETTING_ITEMS, VETTING_WORDING, type Vetting } from '@/lib/work-public';
import { toast } from './Toast';
import { fmtDate } from '@/lib/words';

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
      const out = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(out.error ?? 'The file did not upload. Please try again.');
      toast.saved('Sent to Relève');
      router.refresh();
    } catch (e: any) {
      toast.bad(e.message);
    } finally { setBusy(null); }
  }

  const done = rows.filter(r => r.state === 'verified').length;

  /* The tab opens inside the tap (Safari blocks one opened after an await). */
  function view(path: string) {
    return openSignedLink(async () => {
      const res = await fetch(`/api/vetting?path=${encodeURIComponent(path)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'The document did not open. Please try again.');
      return d.url;
    }, msg => toast.bad(msg), 'The document did not open. Please try again.');
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Before you can be placed</h3>
        <span className={`pill ${done === VETTING_ITEMS.length ? 'good' : ''}`}>
          {done === VETTING_ITEMS.length && <span className="dot" />}
          {done} of {VETTING_ITEMS.length} verified
        </span>
      </div>
      <p className="small muted" style={{ marginBottom: 24 }}>
        We check these once, for everyone on the roster. This is why an executive can trust you
        with their calendar from your first week. Clients never see these documents. They only
        see that you are verified.
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
                {item.why && <p className="xs muted" style={{ margin: '6px 0 0' }}>{item.why}</p>}
                {state === 'rejected' && row?.reject_reason && (
                  <p className="small" style={{ color: '#7A2E26', marginTop: 10 }}>
                    <b>Please upload again:</b> {row.reject_reason}
                  </p>
                )}
                {state === 'verified' && row?.expires_on && (
                  <p className="xs muted" style={{ marginTop: 8 }}>
                    Valid until {fmtDate(row.expires_on)}
                  </p>
                )}
              </div>
              <span className={`pill ${TONE[state]}`}>
                {state === 'verified' && <span className="dot" />}{VETTING_WORDING[state]}
              </span>
            </div>

            {/* Relève issues this one. The talent reads and signs it in the
                account (/app/agreement); once signed, the filed copy is theirs
                to read. */}
            {item.issuedByTeam ? (
              row?.file_path ? (
                <div className="vet-actions">
                  <button className="btn sm ghost" onClick={() => view(row.file_path!)}>
                    Read your {item.label.toLowerCase()}
                  </button>
                </div>
              ) : state !== 'verified' && (
                <div className="vet-actions">
                  <a className="btn sm solid" href="/app/agreement">Read and sign</a>
                </div>
              )
            ) : state !== 'verified' && (
              <div className="vet-actions">
                <input aria-label={`Upload ${item.label}`}
                  ref={el => { inputs.current[item.kind] = el; }}
                  type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" hidden
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const exp = item.expires
                      ? (document.getElementById(`exp-${item.kind}`) as HTMLInputElement)?.value ?? ''
                      : '';
                    upload(item.kind, f, exp);
                    e.target.value = '';
                  }} />
                <button className="btn sm solid" disabled={busy === item.kind}
                  onClick={() => inputs.current[item.kind]?.click()}>
                  {busy === item.kind ? 'Uploading…'
                    : state === 'submitted' ? 'Replace document' : 'Choose a file'}
                </button>
                {item.expires && (
                  <label className="ff vet-exp">
                    <span className="xs muted">Expiry date on the document</span>
                    <input id={`exp-${item.kind}`} type="date" />
                  </label>
                )}
                {state === 'submitted' && <span className="xs muted">We will review this within one day.</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
