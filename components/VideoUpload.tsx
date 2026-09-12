'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, saving } from './Toast';

/* A talent's own introduction, in their own voice. Unlike a photo there is
   no safe way to crop or re-encode video in the browser, so this uploads
   exactly what they record or pick, checked for size and type client-side
   first so nobody waits on a doomed upload only to be turned away by the
   server. */
const MAX_MB = 40;

export default function VideoUpload({ initial, name }: { initial?: string | null; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function take(file: File | undefined) {
    setErr(null);
    if (!file) return;
    if (!file.type.startsWith('video/')) return setErr('That needs to be a video — an MP4 or MOV from your phone works well.');
    if (file.size > MAX_MB * 1024 * 1024) return setErr(`That video is over ${MAX_MB}MB. A shorter clip, thirty to sixty seconds, is plenty.`);

    setBusy(true);
    try {
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      const body = new FormData();
      body.append('video', file, file.name);
      const res = await fetch('/api/video', { method: 'POST', body });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'The upload did not go through.');
      setPreview(out.url);
      toast.saved('Introduction video added');
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
      setPreview(initial ?? null);
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setErr(null);
    await saving(() => fetch('/api/video', { method: 'DELETE' }), 'Video removed');
    setPreview(null); setBusy(false); router.refresh();
  }

  return (
    <div>
      <div className={`photo-drop ${drag ? 'over' : ''} ${busy ? 'busy' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}>

        {preview
          ? <video key={preview} src={preview} controls playsInline
              style={{ width: 120, height: 120, borderRadius: 10, objectFit: 'cover', background: 'var(--ink)' }}
              aria-label={`${name}'s introduction video`} />
          : <div className="photo-shot empty" aria-hidden><span>{(name || '?').trim().charAt(0).toUpperCase()}</span></div>}

        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm solid" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Working…' : preview ? 'Choose a different video' : 'Choose a video'}
            </button>
            {preview && !busy && (
              <button disabled={busy} type="button" className="btn sm ghost" onClick={remove}>Remove</button>
            )}
          </div>
          <p className="xs muted" style={{ marginTop: 10 }}>
            Thirty to sixty seconds, in your own words: who you are, what you are good at,
            and what you are like to work with. MP4 or MOV, under {MAX_MB}MB. Drag one here if you prefer.
          </p>
        </div>
      </div>

      <input ref={input} type="file" accept="video/*" hidden
        onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }} />

      {err && <p className="small" style={{ color: 'var(--rust, #8C4A3F)', marginTop: 10 }}>{err}</p>}
    </div>
  );
}
