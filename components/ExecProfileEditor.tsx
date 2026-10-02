'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import PhotoUpload from './PhotoUpload';
import { saving } from './Toast';

/* The executive's own profile. Deliberately shorter than the talent one —
   an executive is not being assessed here, they are being introduced.

   Opens read-only. The dark card above this one already shows how the
   profile reads to a candidate, so a page that also drops straight into an
   open form reads like nothing here is finished — "Edit profile" is the one
   door in, and saving walks back out through it. */
export default function ExecProfileEditor({ initial }: { initial: any }) {
  const fid = useId();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    f.forEach((v, k) => { body[k] = v; });
    const ok = await saving(() => fetch('/api/profile', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }), 'Profile saved');
    setBusy(false);
    if (ok) { router.refresh(); setEditing(false); }
  }

  if (!editing) {
    return (
      <div className="card">
        <div className="card-head">
          <h3>Your details</h3>
          <button type="button" className="btn sm ghost" onClick={() => setEditing(true)}>Edit profile</button>
        </div>
        <dl className="brief-facts">
          <dt>Name</dt><dd>{initial.full_name || '·'}</dd>
          <dt>Title</dt><dd>{initial.headline || '·'}</dd>
          <dt>Company</dt><dd>{initial.org_name || '·'}</dd>
          <dt>Based in</dt><dd>{initial.location || '·'}</dd>
          <dt>Timezone</dt><dd>{initial.timezone || '·'}</dd>
        </dl>
        {initial.bio && <p className="small muted" style={{ marginTop: 16, maxWidth: 620 }}>{initial.bio}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="card">
        <div className="card-head">
          <h3>You</h3>
          <span className="pill">Shown to matched talent</span>
        </div>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label htmlFor={`${fid}-1`}>Your name</label>
            <input id={`${fid}-1`} name="full_name" defaultValue={initial.full_name ?? ''} /></div>
          <div className="ff"><label htmlFor={`${fid}-2`}>Your title</label>
            <input id={`${fid}-2`} name="headline" defaultValue={initial.headline ?? ''} placeholder="Founder & CEO" /></div>
        </div>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label htmlFor={`${fid}-3`}>Company</label>
            <input id={`${fid}-3`} name="org_name" defaultValue={initial.org_name ?? ''} placeholder="Marsh & Co." /></div>
          <div className="ff"><label htmlFor={`${fid}-4`}>Where you are based</label>
            <input id={`${fid}-4`} name="location" defaultValue={initial.location ?? ''} placeholder="Los Angeles, USA" /></div>
        </div>
        <div className="ff" style={{ maxWidth: 320 }}><label htmlFor={`${fid}-5`}>Your timezone</label>
          <input id={`${fid}-5`} name="timezone" defaultValue={initial.timezone ?? ''} placeholder="America/Los_Angeles" /></div>
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
          <textarea aria-label="A short introduction" name="bio" rows={4} defaultValue={initial.bio ?? ''}
            placeholder="What the company does, what the last year has looked like, and what you actually need off your plate." />
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Photo</h3><span className="pill">Optional, but it helps</span></div>
        <p className="small muted" style={{ marginBottom: 18 }}>
          People prepare differently for a person than for a job title. It saves on its own,
          so you do not need to press save below for this one.
        </p>
        <PhotoUpload initial={initial.photo_url} name={initial.full_name ?? ''} />
      </div>

      <div className="row" style={{ gap: 14 }}>
        <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
        <span className="small muted">Only matched candidates see this, never the wider roster.</span>
      </div>
    </form>
  );
}
