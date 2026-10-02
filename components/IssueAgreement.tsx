'use client';
import { useRef, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import CountersignButton from './CountersignButton';
import { todayInPacific } from '@/lib/money-public';

type Person = { id: string; full_name: string | null; email: string; role: string };
type Pending = { id: string; name: string; envelopeId: string };

export default function IssueAgreement({ talent, docusignOn, pendingCountersign }: {
  talent: Person[]; docusignOn?: boolean; pendingCountersign?: Pending[];
}) {
  const fid = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState('');
  /* The date on the signature. Filing a file used to verify somebody
     outright, so an unsigned draft cleared them exactly as well as a signed
     one — and the database then refused to release only the unverified.
     DocuSign fills this in itself once it reports back signed. */
  const [signed, setSigned] = useState(todayInPacific());
  const input = useRef<HTMLInputElement>(null);

  async function sendViaDocuSign() {
    if (!who) return toast.bad('Choose who this belongs to first.');
    setBusy(true);
    try {
      const res = await fetch('/api/vetting/docusign', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ talent_id: who })
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'DocuSign would not send that.');
      toast.saved('Sent. Filed automatically once it comes back signed by both sides');
      setWho('');
      router.refresh();
    } catch (e: any) { toast.bad(e.message); }
    finally { setBusy(false); }
  }

  async function upload(file: File) {
    if (!who) return toast.bad('Choose who this belongs to first.');
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    body.append('kind', 'agreement');
    body.append('talent_id', who);
    body.append('signed_on', signed);
    try {
      const res = await fetch('/api/vetting', { method: 'POST', body });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'That did not upload.');
      toast.saved('Filed. They can read it in their account');
      setWho('');
      router.refresh();
    } catch (e: any) { toast.bad(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>File a signed agreement</h3></div>
      <p className="small muted" style={{ marginBottom: 18 }}>
        {docusignOn
          ? <>Send it through DocuSign and it files itself here the moment BOTH signatures are on it: theirs,
              then yours. You are sent here to countersign once they have signed their half, below. Or
              upload a signed copy you already have some other way.</>
          : <>You send the contractor agreement and NDA yourself, they sign it, and you file the signed copy here.
              It appears in their account to read; they cannot upload or change it.</>}
      </p>
      <div className="grid-2" style={{ gap: 14, alignItems: 'end' }}>
        <div className="ff" style={{ marginBottom: 0 }}><label htmlFor={`${fid}-1`}>Whose agreement</label>
          <select id={`${fid}-1`} value={who} onChange={e => setWho(e.target.value)}>
            <option value="">Choose a candidate…</option>
            {talent.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
          </select></div>
        <div className="ff" style={{ marginBottom: 0 }}><label htmlFor={`${fid}-2`}>Date on the signature{docusignOn ? ' (only if uploading by hand)' : ''}</label>
          <input id={`${fid}-2`} type="date" value={signed} onChange={e => setSigned(e.target.value)} />
          <span className="xs muted">
            {docusignOn ? 'DocuSign fills this in itself. Only needed for a manual upload.'
              : 'Filing without this leaves them unverified, so they cannot be released.'}
          </span></div>
      </div>
      <div className="row" style={{ marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
        {docusignOn && (
          <button className="btn solid" disabled={busy || !who} onClick={sendViaDocuSign}>
            {busy ? 'Sending…' : 'Send via DocuSign'}
          </button>
        )}
        <div>
          <input aria-label="Agreement file" ref={input} type="file" accept="application/pdf,image/*" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          <button className={docusignOn ? 'btn sm ghost' : 'btn solid'}
            disabled={busy || !who || (!docusignOn && !signed)} onClick={() => input.current?.click()}>
            {busy ? 'Filing…' : docusignOn ? 'Or upload a signed copy you already have' : 'Upload the signed copy'}
          </button>
        </div>
      </div>

      {/* Whoever has signed their half and is waiting on Sage's Company
          signature — the envelope will not complete, and the row will not
          reach 'verified', until she countersigns each of these. */}
      {docusignOn && pendingCountersign && pendingCountersign.length > 0 && (
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--rule, #e5e5e5)' }}>
          <h4 style={{ margin: '0 0 10px' }}>Waiting on your signature</h4>
          {pendingCountersign.map(p => (
            <div key={p.id} className="row between" style={{ alignItems: 'center', padding: '8px 0', flexWrap: 'wrap', gap: 10 }}>
              <span className="small">{p.name}</span>
              <CountersignButton kind="talent" id={p.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
