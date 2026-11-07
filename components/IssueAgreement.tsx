'use client';
import { useRef, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { todayInPacific } from '@/lib/money-public';

type Person = { id: string; full_name: string | null; email: string; role: string };

/* Talent sign their contractor agreement in their own account
   (/app/agreement) and it files itself. This card is the fallback: file a
   paper copy that came back signed some other way. */
export default function IssueAgreement({ talent }: { talent: Person[] }) {
  const fid = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState('');
  /* The date on the signature. Filing a file used to verify somebody
     outright, so an unsigned draft cleared them exactly as well as a signed
     one, and the database then refused to release only the unverified. */
  const [signed, setSigned] = useState(todayInPacific());
  const input = useRef<HTMLInputElement>(null);

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
      const out = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(out.error ?? 'Upload failed. Please try again.');
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
        Talent sign their contractor agreement in their own account, and it is filed here automatically. Use
        this only for a copy signed outside the app. It then appears in their account.
      </p>
      <div className="grid-2" style={{ gap: 14, alignItems: 'start' }}>
        <div className="ff" style={{ marginBottom: 0 }}><label htmlFor={`${fid}-1`}>Whose agreement</label>
          <select id={`${fid}-1`} value={who} onChange={e => setWho(e.target.value)}>
            <option value="">Choose talent…</option>
            {talent.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
          </select></div>
        <div className="ff" style={{ marginBottom: 0 }}><label htmlFor={`${fid}-2`}>Date on the signature</label>
          <input id={`${fid}-2`} type="date" value={signed} onChange={e => setSigned(e.target.value)} />
          <span className="xs muted">Without a signature date they stay unverified and cannot be released.</span></div>
      </div>
      <div className="row" style={{ marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
        <input aria-label="Agreement file" ref={input} type="file" accept="application/pdf,image/*" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        <button className="btn sm solid" disabled={busy || !who || !signed} onClick={() => input.current?.click()}>
          {busy ? 'Filing…' : 'Upload the signed copy'}
        </button>
      </div>
    </div>
  );
}
