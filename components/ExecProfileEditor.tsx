'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PhotoUpload from './PhotoUpload';
import { saving } from './Toast';

/* The executive's own profile. Deliberately shorter than the talent one —
   an executive is not being assessed here, they are being introduced. */
export default function ExecProfileEditor({ initial }: { initial: any }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    f.forEach((v, k) => { body[k] = v; });
    const ok = await saving(() => fetch('/api/profile', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }), 'Profile saved');
    setBusy(false); setSaved(ok); if (ok) router.refresh();
  }

  return (
    <form onSubmit={submit} onChange={() => setSaved(false)}>
      <div className="card">
        <div className="card-head">
          <h3>You</h3>
          <span className="pill">Shown to matched talent</span>
        </div>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label>Your name</label>
            <input name="full_name" defaultValue={initial.full_name ?? ''} /></div>
          <div className="ff"><label>Your title</label>
            <input name="headline" defaultValue={initial.headline ?? ''} placeholder="Founder & CEO" /></div>
        </div>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label>Company</label>
            <input name="org_name" defaultValue={initial.org_name ?? ''} placeholder="Marsh & Co." /></div>
          <div className="ff"><label>Where you are based</label>
            <input name="location" defaultValue={initial.location ?? ''} placeholder="Los Angeles, USA" /></div>
        </div>
        <div className="ff" style={{ maxWidth: 320 }}><label>Your timezone</label>
          <input name="timezone" defaultValue={initial.timezone ?? ''} placeholder="America/Los_Angeles" /></div>
        <p className="xs muted">
          Your timezone decides which interview slots you are offered. It is the one field worth getting exactly right.
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h3>A short introduction</h3><span className="pill">Optional</span></div>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Two or three sentences about the business and what the person beside you would be walking into.
          Candidates read this before an interview, and it is the difference between someone who prepared and someone who did not.
        </p>
        <div className="ff">
          <textarea name="bio" rows={4} defaultValue={initial.bio ?? ''}
            placeholder="What the company does, what the last year has looked like, and what you actually need off your plate." />
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Photo</h3><span className="pill">Optional, but it helps</span></div>
        <p className="small muted" style={{ marginBottom: 18 }}>
          People prepare differently for a person than for a job title. It saves on its own —
          you do not need to press save below for this one.
        </p>
        <PhotoUpload initial={initial.photo_url} name={initial.full_name ?? ''} />
      </div>

      <div className="row" style={{ gap: 14 }}>
        <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save'}</button>
        <span className="small muted">Only matched candidates see this — never the wider bench.</span>
      </div>
    </form>
  );
}
