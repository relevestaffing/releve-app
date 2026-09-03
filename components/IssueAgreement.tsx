'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';

type Person = { id: string; full_name: string | null; email: string; role: string };

export default function IssueAgreement({ talent }: { talent: Person[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!who) return toast.bad('Choose who this belongs to first.');
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    body.append('kind', 'agreement');
    body.append('talent_id', who);
    try {
      const res = await fetch('/api/vetting', { method: 'POST', body });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'That did not upload.');
      toast.saved('Filed — they can read it in their account');
      setWho('');
      router.refresh();
    } catch (e: any) { toast.bad(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>File a signed agreement</h3></div>
      <p className="small muted" style={{ marginBottom: 18 }}>
        You send the contractor agreement and NDA yourself, they sign it, and you file the signed copy here.
        It appears in their account to read — they cannot upload or change it. Filing it marks them cleared on that item.
      </p>
      <div className="grid-2" style={{ gap: 14, alignItems: 'end' }}>
        <div className="ff" style={{ marginBottom: 0 }}><label>Whose agreement</label>
          <select value={who} onChange={e => setWho(e.target.value)}>
            <option value="">Choose a candidate…</option>
            {talent.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
          </select></div>
        <div>
          <input ref={input} type="file" accept="application/pdf,image/*" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          <button className="btn solid" disabled={busy || !who} onClick={() => input.current?.click()}>
            {busy ? 'Filing…' : 'Upload the signed copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
