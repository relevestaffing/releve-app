'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, saving } from './Toast';

/* Pick a photo from the device. It is cropped to a square and shrunk in the
   browser before it ever leaves, so nobody waits on a 12-megapixel upload and
   nothing enormous lands in storage. */
const SIZE = 512;
const MAX_INPUT_MB = 12;

function squareJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);          // centre crop
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const c = document.createElement('canvas');
      c.width = SIZE; c.height = SIZE;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('Your browser could not process that image.'));
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Could not read that image.')), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file did not open as an image.')); };
    img.src = url;
  });
}

export default function PhotoUpload({ initial, name }: { initial?: string | null; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function take(file: File | undefined) {
    setErr(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) return setErr('That needs to be an image — a JPG, PNG or HEIC from your phone or camera roll.');
    if (file.size > MAX_INPUT_MB * 1024 * 1024) return setErr(`That photo is over ${MAX_INPUT_MB}MB. Pick a smaller one.`);

    setBusy(true);
    try {
      const blob = await squareJpeg(file);
      setPreview(URL.createObjectURL(blob));
      const body = new FormData();
      body.append('photo', blob, 'photo.jpg');
      const res = await fetch('/api/photo', { method: 'POST', body });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'The upload did not go through.');
      setPreview(out.url);
      toast.saved('Photo updated');
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
      setPreview(initial ?? null);
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setErr(null);
    await saving(() => fetch('/api/photo', { method: 'DELETE' }), 'Photo removed');
    setPreview(null); setBusy(false); router.refresh();
  }

  return (
    <div>
      <div className={`photo-drop ${drag ? 'over' : ''} ${busy ? 'busy' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}>

        {preview
          ? <div className="photo-shot" style={{ backgroundImage: `url("${preview}")` }} role="img" aria-label={name} />
          : <div className="photo-shot empty" aria-hidden><span>{(name || '?').trim().charAt(0).toUpperCase()}</span></div>}

        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm solid" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Working…' : preview ? 'Choose a different photo' : 'Choose a photo'}
            </button>
            {preview && !busy && (
              <button type="button" className="btn sm ghost" onClick={remove}>Remove</button>
            )}
          </div>
          <p className="xs muted" style={{ marginTop: 10 }}>
            From your computer or phone — JPG, PNG or HEIC. Drag one here if you prefer.
            We crop it to a square for you, so anything roughly centred works.
          </p>
        </div>
      </div>

      <input ref={input} type="file" accept="image/*" hidden
        onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }} />

      {err && <p className="small" style={{ color: 'var(--rust, #8C4A3F)', marginTop: 10 }}>{err}</p>}
    </div>
  );
}
