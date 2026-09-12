'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import PhotoUpload from './PhotoUpload';
import VideoUpload from './VideoUpload';


export default function ProfileEditor({ initial }: { initial: any }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const f = new FormData(e.currentTarget);
    const body: any = {};
    f.forEach((v, k) => {
      const str = String(v).trim();
      body[k] = str === '' ? null : k === 'years_exp' ? Number(str) : str;
    });
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

      {/* The skill pills used to live here. They asked the same question as
          Your Skills, in a shallower way, and both were shown to executives —
          so a candidate could look strong on one and weak on the other. One
          instrument now, and it is the deep one. */}
      <div className="card tight">
        <p className="small" style={{ margin: 0 }}>
          <b>Your skills are set on their own page.</b> Twelve areas of work, each
          broken down properly — that is what executives are matched against.
        </p>
        <a className="btn sm ghost" href="/app/skills" style={{ marginTop: 14 }}>
          Open Your Skills
        </a>
      </div>

      {/* The checklist links here with #photo; without the id it landed at the
          top of a long form with no clue what to do. */}
      <div className="card" id="photo" style={{ scrollMarginTop: 90 }}>
        <div className="card-head"><h3>Photo</h3><span className="pill">Optional, but it helps</span></div>
        <p className="small muted" style={{ marginBottom: 18 }}>
          A clear photo of your face. A plain background and good light is all it takes —
          it saves on its own, you do not need to press save below for this one.
        </p>
        <PhotoUpload initial={initial.photo_url} name={initial.full_name ?? ''} />
      </div>

      {/* The checklist links here with #video, same reasoning as #photo. */}
      <div className="card" id="video" style={{ scrollMarginTop: 90 }}>
        <div className="card-head"><h3>Introduction video</h3><span className="pill">Optional, but it stands out</span></div>
        <p className="small muted" style={{ marginBottom: 18 }}>
          Executives read a lot of profiles. Thirty seconds of you, in your own voice,
          is the fastest way to become a person rather than a row — it saves on its own,
          you do not need to press save below for this one.
        </p>
        <VideoUpload initial={initial.intro_video_url} name={initial.full_name ?? ''} />
      </div>

      <div className="row" style={{ gap: 14 }}>
        <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save my profile'}</button>
        <span className="small muted">Your Relève team is notified of changes. Your pay is set by Relève and is never shown to clients.</span>
      </div>
    </form>
  );
}
