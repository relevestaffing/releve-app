'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import PhotoUpload from './PhotoUpload';

const SUGGESTED = ['Inbox & calendar','Travel','Board prep','Client care','Bookkeeping','CRM hygiene',
  'Social media','Newsletter','SOP build','Research','Slide decks','Recruiting','Vendor management','Bilingual'];

export default function ProfileEditor({ initial }: { initial: any }) {
  const router = useRouter();
  const [skills, setSkills] = useState<string[]>(initial.skills ?? []);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function toggle(s: string) {
    setSkills(skills.includes(s) ? skills.filter(x => x !== s) : [...skills, s]);
    setSaved(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const f = new FormData(e.currentTarget);
    const body: any = { skills };
    f.forEach((v, k) => { if (v !== '') body[k] = k === 'years_exp' ? Number(v) : v; });
    const ok = await saving(() => fetch('/api/profile', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }), 'Profile saved');
    setBusy(false); setSaved(ok); if (ok) router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="card">
        <div className="card-head"><h3>About you</h3>
          <span className="pill">Shown to executives</span></div>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label>Full name</label><input name="full_name" defaultValue={initial.full_name ?? ''} /></div>
          <div className="ff"><label>Your role</label>
            <input name="headline" defaultValue={initial.headline ?? ''} placeholder="Executive Assistant" /></div>
        </div>
        <div className="grid-4" style={{ gap: 14 }}>
          <div className="ff"><label>Location</label><input name="location" defaultValue={initial.location ?? ''} placeholder="Cebu, Philippines" /></div>
          <div className="ff"><label>Timezone</label><input name="timezone" defaultValue={initial.timezone ?? ''} placeholder="Asia/Manila" /></div>
          <div className="ff"><label>Years of experience</label><input name="years_exp" type="number" min="0" defaultValue={initial.years_exp ?? ''} /></div>
          <div className="ff"><label>English</label>
            <select name="english" defaultValue={initial.english ?? 'Fluent'}>
              <option>Native-fluent</option><option>Fluent</option><option>Conversational</option></select></div>
        </div>
        <div className="ff"><label>A short introduction</label>
          <textarea name="bio" rows={4} defaultValue={initial.bio ?? ''}
            placeholder="Two or three sentences. What you have run, who you have supported, and what you are good at when nobody is watching." /></div>
        <p className="xs muted">Write it the way you would say it. Executives read this before anything else.</p>
      </div>

      <div className="card">
        <div className="card-head"><h3>What you can do</h3><span className="pill">{skills.length} selected</span></div>
        <p className="small muted" style={{ marginBottom: 18 }}>Pick everything you have genuinely done in a paid role.</p>
        <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
          {[...new Set([...SUGGESTED, ...skills])].map(s => (
            <button type="button" key={s} onClick={() => toggle(s)}
              className={`pill ${skills.includes(s) ? 'fern' : ''}`} style={{ cursor: 'pointer' }}>{s}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Photo</h3><span className="pill">Optional, but it helps</span></div>
        <p className="small muted" style={{ marginBottom: 18 }}>
          A clear photo of your face. A plain background and good light is all it takes —
          it saves on its own, you do not need to press save below for this one.
        </p>
        <PhotoUpload initial={initial.photo_url} name={initial.full_name ?? ''} />
      </div>

      <div className="row" style={{ gap: 14 }}>
        <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save my profile'}</button>
        <span className="small muted">Your Relève team is notified of changes. Your pay is set by Relève and is never shown to clients.</span>
      </div>
    </form>
  );
}
